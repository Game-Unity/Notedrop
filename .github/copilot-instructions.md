# Known Issue: Study iframe in VS Code Integrated Browser

The Study/Practice view works fully in Microsoft Edge, but the card iframe (for example, `/frame/basic`) remains blank in the VS Code/Copilot Integrated Browser. In that browser, the frame navigation is reported as `net::ERR_ABORTED`, even though the frame endpoint returns HTTP 200 and the Study API returns valid card data. The Practice button and routing have been verified to work correctly.

The suspected cause is a browser incompatibility with sandboxed iframe navigation. This cause has not been conclusively confirmed.

When working on the Study view:

- Do not automatically treat a blank card iframe in the VS Code Integrated Browser as a NoteDrop regression.
- Verify Study view changes in Microsoft Edge, including Front, Back, Show Answer, and the rating actions.
- For CSS or layout-only work, do not modify the existing iframe sandbox, Content Security Policy (CSP), or card runtime.
- Never disable or weaken Etude security mechanisms merely to work around this browser issue.
- If the same failure occurs in Edge, investigate it independently of this known Integrated Browser issue.
