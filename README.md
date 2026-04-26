# RH Dashboard

Real-time hardware intelligence dashboard for RH Assistant.

## Development

Install dependencies:

```sh
npm install
```

Run the local dashboard:

```sh
npm run dev -- --host 0.0.0.0
```

Build for production:

```sh
npm run build
```

## Firebase configuration

The app can connect to Firebase Realtime Database when these environment values are provided:

- `VITE_FIREBASE_CONFIG`: JSON Firebase web app config
- `VITE_APP_ID`: optional app id used in database paths

Without Firebase configuration, the app runs in local demo mode with synthetic agents so the development environment can be verified.
