# Development and production releases

The GitHub repository is [BradRoland/leostudy](https://github.com/BradRoland/leostudy). Development work is published through its existing [dev branch](https://github.com/BradRoland/leostudy/tree/dev); `main` remains the production branch.

| Branch | Website | Data | Release behavior |
| --- | --- | --- | --- |
| `dev` | https://dev.180.academy | Existing isolated Supabase clone | Coolify builds and checks each push, then deploys the development application. |
| `main` | https://180.academy | Existing production Supabase | Existing production deployment; promote changes only after Brad approves them. |

## Daily workflow

1. Make and commit changes on `dev`, or merge a completed feature branch into `dev`.
2. Push `dev` to GitHub. A local commit alone does not update the website.
3. Review the **Development checks** workflow in GitHub and the development application's deployment in Coolify.
4. Test the published site, including any affected sign-in, class, chat, and study flows.
5. After Brad explicitly approves a production release, open/review a pull request from `dev` into `main`, resolve any conflicts, and merge the approved changes. That main-branch update uses the existing production deployment.

No development workflow merges or pushes to `main`. This setup does not add or change main-branch protection rules, and approval remains a release requirement for the operator.

## Build and environment separation

The development application uses `ops/dev-preview/Dockerfile.github`, while the production Dockerfile remains unchanged by this automation setup. The development image runs tests, lint, TypeScript, and the application build before a replacement runtime can be published. GitHub also reports independent checks on pushes and pull requests targeting `dev`.

Development build settings fix the public API and account links to `dev.180.academy`. Runtime settings point to the existing isolated gateway and test mail sink. Runtime service credentials are kept in the server's deployment configuration, never in GitHub source, browser bundles, or GitHub Actions. A startup guard rejects production API URLs, live integrations, or an external mail transport.

Google sign-in, real payment processing, real email delivery, and the production game worker remain disabled in the development environment. The preview retains ordinary email/password sign-in and routes class-approval and recovery messages into the private test inbox.

Database migrations are **not** applied automatically by a code push. Schema changes must be tested against the existing clone, and any production migration must be included in a separately approved release plan. Never refresh the clone over its existing data as part of a routine deployment.

For the current overhaul, the production release plan must include the tested class-request/email workflow and private-study-profile migrations, plus production email and authentication settings. The new interface depends on that schema. Prepare the production backup, configuration, migration order, and rollback before seeking release approval; do not merge the UI alone and expect development database changes to appear in production.

## Troubleshooting

- If a build fails, inspect the first failing check in Coolify and GitHub; fix the change and push to `dev` again.
- Compare `/app-version.json` on the development website with the intended GitHub commit to confirm which source is live.
- Use Coolify's development application history for deployment status. Select only the development resource when redeploying or rolling back.
- The retained pre-automation development runtime and proxy configuration provide a separate rollback path; see [Development server deployment](DEV_SERVER_DEPLOYMENT.md).
- No production deployment is needed to fix or retry a development deployment.
