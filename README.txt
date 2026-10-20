MYME CONTROL CENTER — GITHUB PAGES

1) Upload the CONTENTS of this folder to the root of repository MyMeGroup.github.io. Based on the screenshot (owner HaiYeuEm), the expected project site URL is https://haiyeuem.github.io/MyMeGroup.github.io/ . At repository root, index.html, style.css, app.js, config.js and avatar-fallback.svg should appear together.
2) Open Settings -> Pages -> Deploy from a branch -> main -> /(root) -> Save.
3) Edit config.js only after the bot backend is publicly running with HTTPS. Set: window.MYME_API_BASE = 'https://YOUR-BOT-BACKEND-DOMAIN';
4) Configure these backend .env values to match the public domains: DASHBOARD_BASE_URL, OAUTH_REDIRECT_URI, DASHBOARD_FRONTEND_URL. Add the exact OAUTH_REDIRECT_URI in Discord Developer Portal -> OAuth2 -> Redirects.
5) Keep bot token, Discord client secret, SESSION_SECRET and VietQR secrets in the backend .env ONLY. Never publish them to GitHub Pages.

If config.js is blank, the redesigned landing screen still displays, but sign-in and bot control are intentionally disabled until a backend URL is configured. GitHub Pages is frontend hosting only; it cannot run the Discord bot.

Local backend dashboard: use the public/ folder served by the bot, then open the bot server URL. Do not expose the dashboard publicly before OAuth2 and DASHBOARD_OWNER_ID are configured.
