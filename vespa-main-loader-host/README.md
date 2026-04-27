# vespa-main (Knack Loader Host)

This is a minimal Heroku web app that hosts the VESPA Knack loader script at:

- `GET /loader.js`
- `GET /health`

## Why
- Keep Knack Custom Code small (just a bootstrap snippet).
- Make rollback safer (swap URL / version query param).
- Prepare for moving secrets server-side (next phase).

## Deploy (Heroku, from the Homepage monorepo)

This repo lives inside the `Homepage` repo as `vespa-main-loader-host/`, so the easiest deploy is to use the **monorepo buildpack** and set `APP_BASE`.

Required config:
- `APP_BASE=vespa-main-loader-host`

## Knack Custom Code bootstrap (example)

Load this from Knack Custom Code (after the Heroku app is live):

```js
(function () {
  var s = document.createElement('script');
  s.src = 'https://vespa-main.herokuapp.com/loader.js?v=' + Date.now();
  s.async = true;
  document.head.appendChild(s);
})();
```

