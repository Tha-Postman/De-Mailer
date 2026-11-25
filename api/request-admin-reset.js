
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    SITE_URL,
    BREVO_API_KEY,
    BREVO_SENDER_EMAIL,
    BREVO_SENDER_NAME
  } = process.env;

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !SITE_URL ||
    !BREVO_API_KEY ||
    !BREVO_SENDER_EMAIL ||
    !BREVO_SENDER_NAME
  ) {
    console.error("Password recovery environment variables are incomplete.");
    return res.status(500).json({
      error: "Password recovery is not configured."
    });
  }

  const email = String(req.body?.email || "").trim().toLowerCase();

  if (
    !email ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  const baseUrl = SITE_URL.replace(/\/+$/, "");
  const supabaseUrl = SUPABASE_URL.replace(/\/+$/, "");

  try {
    // Generate a recovery token using Supabase's server-side admin API.
    const linkResponse = await fetch(
      `${supabaseUrl}/auth/v1/admin/generate_link`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          type: "recovery",
          email
        })
      }
    );

    const linkData = await linkResponse.json();

    // Do not reveal whether an email belongs to an admin.
    if (!linkResponse.ok || !linkData.user?.id || !linkData.hashed_token) {
      if (!linkResponse.ok) {
        console.error("Supabase recovery token generation failed:", linkData);
      }

      return res.status(200).json({
        success: true,
        message: "If the address belongs to an admin account, a recovery email will be sent."
      });
    }

    // Confirm that this Supabase user is an authorized admin.
    const adminResponse = await fetch(
      `${supabaseUrl}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(linkData.user.id)}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );

    const admins = await adminResponse.json();

    if (!adminResponse.ok || !Array.isArray(admins) || admins.length === 0) {
      return res.status(200).json({
        success: true,
        message: "If the address belongs to an admin account, a recovery email will be sent."
      });
    }

    // The reset page will verify this token with Supabase in the browser.
    const recoveryUrl = new URL(`${baseUrl}/reset-password.html`);
    recoveryUrl.searchParams.set("token_hash", linkData.hashed_token);
    recoveryUrl.searchParams.set("type", "recovery");

    const htmlContent = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#222;line-height:1.6">
        <h2>Password recovery</h2>
        <p>A password reset was requested for your De Mailer admin account.</p>
        <p>Use the button below to choose a new password.</p>
        <p style="margin:28px 0">
          <a href="${recoveryUrl.toString()}"
             style="background:#111;color:#fff;padding:13px 22px;text-decoration:none;border-radius:6px;display:inline-block">
            Reset my password
          </a>
        </p>
        <p>This link is temporary and can only be used once.</p>
        <p>If you did not request this, you can ignore this email.</p>
        <p>— De Mailer</p>
      </div>
    `;

    // Send through Brevo's HTTP API, not SMTP.
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
          to: [{ email }],
          subject: "Reset your De Mailer admin password",
          htmlContent,
          tags: ["de-mailer-password-recovery"]
        })
      }
    );

    if (!brevoResponse.ok) {
      const errorData = await brevoResponse.text();
      console.error("Brevo recovery email failed:", errorData);

      return res.status(500).json({
        error: "The recovery email could not be sent. Please try again."
      });
    }

    return res.status(200).json({
      success: true,
      message: "If the address belongs to an admin account, a recovery email will be sent."
    });

  } catch (error) {
    console.error("Password recovery error:", error.message);

    return res.status(500).json({
      error: "Something went wrong. Please try again."
    });
  }
};
