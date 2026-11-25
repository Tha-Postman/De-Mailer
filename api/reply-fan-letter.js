
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
    // Verify admin session.
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({ error: "Please sign in again." });
    }

    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`
      }
    });

    if (!authResponse.ok) {
      return res.status(401).json({ error: "Your session is invalid." });
    }

    const user = await authResponse.json();

    // Confirm this user is an authorized admin.
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
        error: "You are not authorized to reply to fan letters."
      });
    }

    // Validate the reply.
    const { messageId, subject, message } = req.body || {};

    if (
      typeof messageId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId) ||
      typeof subject !== "string" ||
      typeof message !== "string" ||
      !subject.trim() ||
      !message.trim() ||
      subject.length > 160 ||
      message.length > 10000
    ) {
      return res.status(400).json({
        error: "Please provide a valid reply subject and message."
      });
    }

    // Retrieve the original fan letter from Supabase.
    const letterResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/fan_messages?id=eq.${encodeURIComponent(messageId)}&select=id,name,email,message`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!letterResponse.ok) {
      return res.status(500).json({
        error: "Could not retrieve the fan letter."
      });
    }

    const letters = await letterResponse.json();
    const letter = letters[0];

    if (!letter) {
      return res.status(404).json({
        error: "This fan letter could not be found."
      });
    }

    if (
      !letter.email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(letter.email)
    ) {
      return res.status(400).json({
        error: "This fan letter does not have a valid email address."
      });
    }

    const escapeHTML = value =>
      String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);

    const safeName = escapeHTML(letter.name || "there");
    const safeSubject = escapeHTML(subject.trim());
    const safeMessage = escapeHTML(message.trim()).replace(/\n/g, "<br>");

    const htmlContent = `
      <div style="font-family:Arial,sans-serif;max-width:600px;
                  margin:auto;padding:30px 20px;color:#392b49;">
        <h2 style="color:#6d28d9;">✉ DE MAILER</h2>
        <p style="font-size:11px;letter-spacing:2px;color:#88799a;">
          THE MAILERS
        </p>
        <hr style="border:0;border-top:1px solid #eee;">
        <h2>${safeSubject}</h2>
        <p>Hello ${safeName},</p>
        <p style="font-size:15px;line-height:1.9;">${safeMessage}</p>
        <p style="margin-top:35px;line-height:1.7;">
          Yours truly,<br><strong>De Mailer</strong>
        </p>
      </div>
    `;

    const textContent =
      `Hello ${letter.name || "there"},\n\n${message.trim()}\n\nYours truly,\nDe Mailer`;

    // Send the personal reply through Brevo.
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
          to: [{
            email: letter.email,
            ...(letter.name ? { name: letter.name } : {})
          }],
          replyTo: {
            email: BREVO_SENDER_EMAIL,
            name: BREVO_SENDER_NAME
          },
          subject: subject.trim(),
          htmlContent,
          textContent,
          tags: ["de-mailer-fan-reply"]
        })
      }
    );

    const brevoResult = await brevoResponse.json();

    if (!brevoResponse.ok) {
      console.error("Brevo reply error:", brevoResult);

      return res.status(502).json({
        error: brevoResult.message ||
          "Brevo could not send this reply."
      });
    }

    // Mark the letter as replied only after Brevo accepts it.
    const updateResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/fan_messages?id=eq.${encodeURIComponent(messageId)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          replied_at: new Date().toISOString()
        })
      }
    );

    if (!updateResponse.ok) {
      console.error("Reply status update failed:", await updateResponse.text());

      return res.status(200).json({
        success: true,
        warning: "Email was accepted, but reply status could not be updated."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Your reply was accepted by Brevo.",
      repliedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("Fan reply endpoint error:", error);

    return res.status(500).json({
      error: "Something went wrong while sending your reply."
    });
  }
};
