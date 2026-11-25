
const crypto = require("crypto");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    BREVO_API_KEY,
    BREVO_SENDER_EMAIL,
    BREVO_SENDER_NAME
  } = process.env;

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !BREVO_API_KEY ||
    !BREVO_SENDER_EMAIL ||
    !BREVO_SENDER_NAME
  ) {
    return res.status(500).json({
      error: "Email change is not configured."
    });
  }

  const accessToken = String(
    req.headers.authorization || ""
  ).replace(/^Bearer\s+/i, "").trim();

  const password = String(req.body?.password || "");
  const newEmail = String(req.body?.newEmail || "")
    .trim()
    .toLowerCase();

  if (!accessToken || !password || !newEmail) {
    return res.status(400).json({
      error: "Please provide your current password and new email."
    });
  }

  if (
    newEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)
  ) {
    return res.status(400).json({
      error: "Enter a valid new email address."
    });
  }

  const baseUrl = SUPABASE_URL.replace(/\/+$/, "");
  const adminHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };

  try {
    // Verify the logged-in user's access token.
    const userResponse = await fetch(`${baseUrl}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`
      }
    });

    const user = await userResponse.json();

    if (!userResponse.ok || !user.id || !user.email) {
      return res.status(401).json({
        error: "Your session has expired. Please sign in again."
      });
    }

    // Confirm this account is an authorized administrator.
    const adminResponse = await fetch(
      `${baseUrl}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`,
      { headers: adminHeaders }
    );

    const admins = await adminResponse.json();

    if (!adminResponse.ok || !Array.isArray(admins) || admins.length === 0) {
      return res.status(403).json({
        error: "This account is not authorized to change admin details."
      });
    }

    if (newEmail === user.email.toLowerCase()) {
      return res.status(400).json({
        error: "This is already your current email address."
      });
    }

    // Verify the current password directly with Supabase Auth.
    const passwordResponse = await fetch(
      `${baseUrl}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          email: user.email,
          password
        })
      }
    );

    const passwordData = await passwordResponse.json();

    if (
      !passwordResponse.ok ||
      passwordData.user?.id !== user.id
    ) {
      return res.status(401).json({
        error: "Your current password is incorrect."
      });
    }

    // Limit requests to three per hour for this admin.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const recentResponse = await fetch(
      `${baseUrl}/rest/v1/admin_email_change_requests?select=id&user_id=eq.${encodeURIComponent(user.id)}&created_at=gte.${encodeURIComponent(oneHourAgo)}`,
      { headers: adminHeaders }
    );

    const recentRequests = await recentResponse.json();

    if (!recentResponse.ok) {
      throw new Error("Could not check email change request limits.");
    }

    if (recentRequests.length >= 3) {
      return res.status(429).json({
        error: "You have requested too many codes. Please try again later."
      });
    }

    // Generate a six-digit verification code.
    const code = crypto.randomInt(100000, 1000000).toString();

    // Store only a keyed hash of the code.
    const codeHash = crypto
      .createHmac("sha256", SUPABASE_SERVICE_ROLE_KEY)
      .update(`${user.id}:${newEmail}:${code}`)
      .digest("hex");

    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    ).toISOString();

    // Remove any previous pending email change for this admin.
    const deleteResponse = await fetch(
      `${baseUrl}/rest/v1/admin_email_change_requests?user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "DELETE",
        headers: adminHeaders
      }
    );

    if (!deleteResponse.ok) {
      throw new Error("Could not prepare the email change request.");
    }

    // Save the new pending request.
    const insertResponse = await fetch(
      `${baseUrl}/rest/v1/admin_email_change_requests`,
      {
        method: "POST",
        headers: {
          ...adminHeaders,
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          user_id: user.id,
          new_email: newEmail,
          code_hash: codeHash,
          expires_at: expiresAt
        })
      }
    );

    if (!insertResponse.ok) {
      throw new Error("Could not create the email verification request.");
    }

    // Send the code to the new email address.
    const htmlContent = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#222;line-height:1.7">
        <h2>Confirm your new email address</h2>
        <p>A request was made to change the email address on your De Mailer administrator account.</p>
        <p>Your verification code is:</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#f3eff8;padding:18px;text-align:center;border-radius:10px;color:#24113f">
          ${code}
        </div>
        <p>This code expires in 10 minutes and can only be used once.</p>
        <p>If you did not request this change, you can ignore this email.</p>
        <p>— De Mailer</p>
      </div>
    `;

    const brevoResponse = await fetch(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": BREVO_API_KEY
        },
        body: JSON.stringify({
          sender: {
            name: BREVO_SENDER_NAME,
            email: BREVO_SENDER_EMAIL
          },
          to: [{ email: newEmail }],
          subject: "Verify your new De Mailer admin email",
          htmlContent,
          tags: ["de-mailer-email-change"]
        })
      }
    );

    if (!brevoResponse.ok) {
      const errorData = await brevoResponse.text();
      console.error("Brevo email change delivery failed:", errorData);

      // Remove the pending request if delivery failed.
      await fetch(
        `${baseUrl}/rest/v1/admin_email_change_requests?user_id=eq.${encodeURIComponent(user.id)}`,
        {
          method: "DELETE",
          headers: adminHeaders
        }
      );

      return res.status(502).json({
        error: "The verification email could not be sent. Please try again."
      });
    }

    return res.status(200).json({
      success: true,
      message: "A verification code has been sent to your new email address. It expires in 10 minutes."
    });

  } catch (error) {
    console.error("Admin email change request error:", error.message);

    return res.status(500).json({
      error: "Something went wrong while requesting the email change."
    });
  }
};
