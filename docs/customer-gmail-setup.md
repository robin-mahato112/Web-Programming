# Gmail delivery for customer password recovery

> Historical optional setup, not required by the current course account flow. The lecturer permits simulated recovery email. See [customer course demo](customer-course-demo.md); existing private Gmail settings can remain unused on your machine.

Developer setup notes. The personal Gmail mailbox is the sender; customers can receive recovery messages at other providers. Do not submit or share the app password with the code, screenshots or report.

1. Sign in to the intended personal Google account and enable [2-Step Verification](https://myaccount.google.com/signinoptions/two-step-verification).
2. Open [App passwords](https://myaccount.google.com/apppasswords), create one named Entertainment Guild, and keep it ready for the local prompt. This is a separate 16-character password, not the ordinary Google password. Google may not offer this option for some managed/Advanced Protection accounts; see [Google's instructions](https://support.google.com/accounts/answer/185833).
3. Install the current customer backend module and rebuild **auth only**, following `customer-account-final.md`. Keep the existing SQL service and all team modules.
4. From PowerShell in this repository, run the interactive configuration script, replacing the two values with the existing backend path and Compose project name:

```powershell
.\scripts\Configure-CustomerGmail.ps1 -BackendDirectory 'C:\path\to\existing\course-backend' -ComposeProject 'YOUR_EXISTING_PROJECT'
```

The script prompts locally for the sender Gmail address, a test recipient you own, and the app password with hidden input. It verifies Gmail authentication, sends a test message, and asks for the verification code from that message. Check Spam/Junk too. It changes the active configuration only after the received code matches. It writes only the backend `.customer.env`, restricts Windows file permissions, and recreates only the existing auth service. Credentials travel to the helper through stdin rather than process arguments. No secret is printed or committed.

Gmail settings are `smtp.gmail.com`, port `465`, TLS enabled, and the same mailbox for SMTP user and From. The browser never receives SMTP credentials. Invalid email configuration disables recovery without stopping the shared API. An SMTP failure does not grant any additional account or staff permissions. Changing Google account password revokes existing app passwords, so reconfigure if needed.

## Verify the actual recovery flow

1. Use an existing customer account registered with an email you can read. SMTP configuration does not create a customer account automatically.
2. Sign out, open Forgot password, enter that customer email and choose Send reset code. The page must no longer display the local-demo notice after auth restarts.
3. Confirm the actual recovery email arrives in that customer's inbox. Paste the reset code into the website and choose a new customer password yourself.
4. Check new-password login, rejection of the old password, rejection of the reused reset code, and preserved profile/order history.
5. Browse products and check the bag and staff/admin sign-in. These use the existing team modules.

SMTP accepting a message does not alone prove that it reached the inbox. The setup code verifies actual receipt of the setup email; separately verify the website's recovery email. Until that second check succeeds, record external recovery delivery as unverified.

Verified locally on 29 October 2026: a recovery request from the website reached a real Gmail inbox. Its code reset a dedicated disposable customer's password through the API. New-password login succeeded; the old password, old session and reused code failed. Existing customer passwords and team data were left unchanged. These private SMTP settings are not included in Git and do not automatically configure teammates' machines.

This implements the business scenario's recovery-email requirement using the existing account API and university database. It is one part of the Canvas final-project criteria; it does not certify the whole team's submission or replace its documentation/demo requirements.
