
const crypto = require("crypto");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY
  } = process.env;

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    return res.status(500).json({
      error: "Email confirmation is not configured."
    });
  }

  const accessToken = String(
    req.headers.authorization || ""
  ).replace(/^Bearer\s+/i, "").trim();

  const code = String(req.body?.code || "").trim();

  if (!accessToken || !/^\d{6}$/.test(code)) {
    return res.status(400).json({
      error: "Enter your six-digit verification code."
    });
  }

  const baseUrl = SUPABASE_URL.replace(/\/+$/, "");

  const adminHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };

  try {
    // Verify the logged-in user.
    const userResponse = await fetch(`${baseUrl}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`
      }
    });

    const user = await userResponse.json();

    if (!userResponse.ok || !user.id) {
      return res.status(401).json({
        error: "Your session has expired. Please sign in again."
      });
    }

    // Confirm that this user is an authorized administrator.
    const adminResponse = await fetch(
      `${baseUrl}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`,
      { headers: adminHeaders }
    );

    const admins = await adminResponse.json();

    if (
      !adminResponse.ok ||
      !Array.isArray(admins) ||
      admins.length === 0
    ) {
      return res.status(403).json({
        error: "This account is not authorized to change admin details."
      });
    }

    // Retrieve the pending email change.
    const requestResponse = await fetch(
      `${baseUrl}/rest/v1/admin_email_change_requests?select=id,new_email,code_hash,expires_at,attempts&user_id=eq.${encodeURIComponent(user.id)}`,
      { headers: adminHeaders }
    );

    const requests = await requestResponse.json();

    if (!requestResponse.ok) {
      throw new Error("Could not retrieve the verification request.");
    }

    if (!Array.isArray(requests) || requests.length === 0) {
      return res.status(400).json({
        error: "No pending email change was found. Please request a new code."
      });
    }

    const pending = requests[0];

    // Check expiration.
    if (new Date(pending.expires_at).getTime() <= Date.now()) {
      await deletePendingRequest(baseUrl, adminHeaders, user.id);

      return res.status(400).json({
        error: "Your verification code has expired. Please request another one."
      });
    }

    // Limit incorrect attempts.
    if (pending.attempts >= 5) {
      await deletePendingRequest(baseUrl, adminHeaders, user.id);

      return res.status(429).json({
        error: "Too many incorrect attempts. Please request a new verification code."
      });
    }

    // Calculate the submitted code's hash.
    const submittedHash = crypto
      .createHmac("sha256", SUPABASE_SERVICE_ROLE_KEY)
      .update(`${user.id}:${pending.new_email}:${code}`)
      .digest("hex");

    const expectedHash = Buffer.from(pending.code_hash, "hex");
    const actualHash = Buffer.from(submittedHash, "hex");

    const codeMatches =
      expectedHash.length === actualHash.length &&
      crypto.timingSafeEqual(expectedHash, actualHash);

    if (!codeMatches) {
      const nextAttempt = pending.attempts + 1;

      await fetch(
        `${baseUrl}/rest/v1/admin_email_change_requests?id=eq.${encodeURIComponent(pending.id)}`,
        {
          method: "PATCH",
          headers: {
            ...adminHeaders,
            Prefer: "return=minimal"
          },
          body: JSON.stringify({
            attempts: nextAttempt
          })
        }
      );

      if (nextAttempt >= 5) {
        await deletePendingRequest(baseUrl, adminHeaders, user.id);

        return res.status(429).json({
          error: "Too many incorrect attempts. Please request a new verification code."
        });
      }

      return res.status(400).json({
        error: `Incorrect verification code. ${5 - nextAttempt} attempts remaining.`
      });
    }

    // Ensure the code still belongs to a valid, unused request.
    // Update the Supabase Auth email after successful verification.
    const updateResponse = await fetch(
      `${baseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`,
      {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({
          email: pending.new_email,
          email_confirm: true
        })
      }
    );

    const updatedUser = await updateResponse.json();

    if (!updateResponse.ok) {
      console.error("Supabase admin email update failed:", updatedUser);

      return res.status(400).json({
        error: updatedUser.msg ||
          updatedUser.message ||
          updatedUser.error_description ||
          "Supabase could not update this email address. It may already be in use."
      });
    }

    // Remove the verification request after success.
    await deletePendingRequest(baseUrl, adminHeaders, user.id);

    return res.status(200).json({
      success: true,
      email: updatedUser.email || pending.new_email,
      message: "Your administrator email address has been changed successfully."
    });

  } catch (error) {
    console.error("Admin email confirmation error:", error.message);

    return res.status(500).json({
      error: "Something went wrong while confirming your new email."
    });
  }
};

async function deletePendingRequest(baseUrl, headers, userId) {
  const response = await fetch(
    `${baseUrl}/rest/v1/admin_email_change_requests?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers
    }
  );

  if (!response.ok) {
    throw new Error("Could not clear the completed email change request.");
  }
}
