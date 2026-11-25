
const SUPABASE_URL = "https://jpehecxayzttovrdjsbd.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_2cIb-WGMArfeoc2OcQuO9w_pNDMxAMX";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const form = document.getElementById("resetPasswordForm");
const feedback = document.getElementById("resetFeedback");
const resetButton = document.getElementById("resetButton");

let recoveryVerified = false;

// Verify the recovery token from the email link.
async function verifyRecoveryLink() {
  const params = new URLSearchParams(window.location.search);

  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  if (!tokenHash || type !== "recovery") {
    feedback.textContent =
      "Invalid or incomplete recovery link. Please request another reset email.";
    resetButton.disabled = true;
    return;
  }

  feedback.textContent = "Verifying your recovery link...";

  try {
    const { data, error } = await db.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery"
    });

    if (error || !data.session) {
      throw error || new Error("Recovery verification failed.");
    }

    recoveryVerified = true;

    feedback.textContent =
      "Your recovery link is verified. You can now choose a new password.";

    // Remove the recovery token from the visible address.
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );

  } catch (error) {
    console.error("Recovery verification error:", error);

    feedback.textContent =
      "This recovery link is invalid or has expired. Please request a new one.";

    resetButton.disabled = true;
  }
}

// Update the admin password.
form.addEventListener("submit", async function (event) {
  event.preventDefault();

  if (!recoveryVerified) {
    feedback.textContent =
      "Please verify your recovery link first.";
    return;
  }

  const password = document.getElementById("newPassword").value;
  const confirmPassword =
    document.getElementById("confirmPassword").value;

  if (password.length < 8) {
    feedback.textContent =
      "Your password must contain at least 8 characters.";
    return;
  }

  if (password !== confirmPassword) {
    feedback.textContent =
      "Your passwords do not match.";
    return;
  }

  resetButton.disabled = true;
  resetButton.textContent = "Updating password...";

  try {
    const { error } = await db.auth.updateUser({
      password: password
    });

    if (error) throw error;

    feedback.textContent =
      "Password updated successfully! Redirecting to your admin dashboard...";

    setTimeout(() => {
      window.location.href = "admin.html";
    }, 2000);

  } catch (error) {
    console.error("Password update error:", error);

    feedback.textContent =
      error.message || "Unable to update your password. Please try again.";

    resetButton.disabled = false;
    resetButton.textContent = "Update password";
  }
});

// Start verification when the page loads.
verifyRecoveryLink();
