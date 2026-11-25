
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    BREVO_API_KEY,
    BREVO_SENDER_EMAIL,
    BREVO_SENDER_NAME
  } = process.env;

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    !BREVO_API_KEY ||
    !BREVO_SENDER_EMAIL ||
    !BREVO_SENDER_NAME
  ) {
    return res.status(500).json({
      error: "Server email settings are incomplete."
    });
  }

  try {
    // Verify the logged-in user's Supabase session.
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({ error: "Please sign in again." });
    }

    const authResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!authResponse.ok) {
      return res.status(401).json({ error: "Your session is invalid." });
    }

    const user = await authResponse.json();

    // Confirm this user is an authorized Postmaster.
    const adminResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!adminResponse.ok) {
      return res.status(403).json({
        error: "Could not verify admin permissions."
      });
    }

    const admins = await adminResponse.json();

    if (!admins.length) {
      return res.status(403).json({
        error: "You are not authorized to send broadcasts."
      });
    }

    // Validate the broadcast.
    const {
      subject,
      message,
      buttonText = "",
      buttonUrl = ""
    } = req.body || {};

    if (
      typeof subject !== "string" ||
      typeof message !== "string" ||
      !subject.trim() ||
      !message.trim() ||
      subject.length > 160 ||
      message.length > 10000
    ) {
      return res.status(400).json({
        error: "Please provide a valid subject and message."
      });
    }

    if (
      buttonText.length > 40 ||
      (buttonUrl && (
        !/^https:\/\/[^\s]+$/i.test(buttonUrl) ||
        buttonUrl.length > 2048
      ))
    ) {
      return res.status(400).json({
        error: "The optional button or link is invalid."
      });
    }

    // Retrieve only subscribers who gave consent.
    const subscribersResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/newsletter_subscribers?select=name,email&consent=eq.true&order=created_at.asc&limit=1001`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!subscribersResponse.ok) {
      return res.status(500).json({
        error: "Could not retrieve your subscriber list."
      });
    }

    const subscribers = await subscribersResponse.json();

    if (subscribers.length > 1000) {
      return res.status(400).json({
        error: "This first version supports up to 1,000 recipients per broadcast."
      });
    }

    const recipients = subscribers.filter(s =>
      s.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)
    );

    if (!recipients.length) {
      return res.status(400).json({
        error: "There are no eligible email subscribers to contact."
      });
    }

    // Escape content before placing it in HTML.
    const escapeHTML = value =>
      String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);

    const safeSubject = escapeHTML(subject.trim());
    const safeMessage = escapeHTML(message.trim()).replace(/\n/g, "<br>");
    const safeButtonText = escapeHTML(buttonText);
    const safeButtonUrl = escapeHTML(buttonUrl);

    const buttonHTML = buttonText && buttonUrl
      ? `<p style="margin:28px 0;">
           <a href="${safeButtonUrl}"
              style="background:#7c3aed;color:#ffffff;padding:13px 22px;
                     text-decoration:none;border-radius:8px;font-weight:bold;">
             ${safeButtonText}
           </a>
         </p>`
      : "";

    const htmlContent = `
      <div style="font-family:Arial,sans-serif;max-width:600px;
                  margin:auto;padding:30px 20px;color:#392b49;">
        <h2 style="color:#6d28d9;">✉ DE MAILER</h2>
        <p style="font-size:11px;letter-spacing:2px;color:#88799a;">
          THE MAILERS
        </p>
        <hr style="border:0;border-top:1px solid #eee;">
        <h1 style="font-size:24px;">${safeSubject}</h1>
        <p style="font-size:15px;line-height:1.9;">${safeMessage}</p>
        ${buttonHTML}
        <p style="margin-top:35px;line-height:1.7;">
          Yours truly,<br><strong>De Mailer</strong>
        </p>
        <hr style="border:0;border-top:1px solid #eee;margin-top:30px;">
        <p style="font-size:11px;color:#888;">
          You're receiving this because you joined THE MAILERS.
          To stop receiving updates, reply to this email with
          UNSUBSCRIBE.
        </p>
      </div>
    `;

    const textContent =
      `${subject.trim()}\n\n${message.trim()}\n\nYours truly,\nDe Mailer\n\nTo stop receiving updates, reply with UNSUBSCRIBE.`;

    // One separate message version per recipient.
    const messageVersions = recipients.map(person => ({
      to: [{
        email: person.email,
        ...(person.name ? { name: person.name } : {})
      }]
    }));

    const brevoResponse = await fetch(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": BREVO_API_KEY,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sender: {
            name: BREVO_SENDER_NAME,
            email: BREVO_SENDER_EMAIL
          },
          subject: subject.trim(),
          htmlContent,
          textContent,
          messageVersions,
          tags: ["de-mailer-broadcast"]
        })
      }
    );

    const brevoResult = await brevoResponse.json();

    if (!brevoResponse.ok) {
      console.error("Brevo sending error:", brevoResult);

      return res.status(502).json({
        error: brevoResult.message ||
          "Brevo could not accept this broadcast. Check your sender settings."
      });
    }

    return res.status(200).json({
      success: true,
      recipientCount: recipients.length,
      messageId: brevoResult.messageId || null,
      message: "Brevo accepted your broadcast."
    });

  } catch (error) {
    console.error("Broadcast endpoint error:", error);

    return res.status(500).json({
      error: "Something went wrong while preparing your broadcast."
    });
  }
};
