# CalorieTrack for iPhone

This small SwiftUI/WebKit app bundles the existing CalorieTrack interface and adds **read-only Apple Health access**. It reads the past 30 calendar days of steps, active energy, exercise minutes, standing minutes, activity rings/goals, and recorded workouts, including walks, runs and football. It requires iOS 16 or newer.

The website and home-screen PWA cannot directly read HealthKit. Use this native iPhone app for automatic syncing. Nothing needs to be published on the App Store for personal use.

## Build and install on your own iPhone

1. On your Mac, install Xcode and the iOS platform support in **Xcode → Settings → Components**. Finish any first-launch setup.
2. In the repository folder, run:

   ```sh
   npm install
   npm run build:ios
   open ios/CalorieTrack.xcodeproj
   ```

3. In Xcode, open **Settings → Accounts** and sign in with your Apple Account.
4. Select the **CalorieTrack** target → **Signing & Capabilities**. Select your team and leave automatic signing enabled. If the default bundle identifier is unavailable, change `com.josias.calorietrack` to a unique identifier of your own. Keep the HealthKit capability enabled.
5. Connect and unlock your iPhone, trust your Mac when prompted, and enable **Settings → Privacy & Security → Developer Mode** if Xcode requests it. Select your iPhone as Xcode's run destination.
6. Click **Run**. Xcode signs and installs the app directly on your phone. With a free Personal Team, the provisioning profile expires after seven days; rebuild/reinstall from Xcode when needed. Keep the bundle identifier the same to preserve app storage.
7. Open **Activity → Connect Apple Health** and choose the data you want to allow. The summary refreshes on connection, once a minute while the app is visible, and when you return to the app. Fitness/Watch workouts appear after they have synced into Apple Health on your iPhone.

Run `npm run build:ios` again after changing the web app, then rebuild in Xcode. The web bundle is generated locally and ignored by Git. Web assets are bundled with the app so tracking and cached summaries work offline. Online food search and the configured meal scanner still require network access; a custom backend must accept the native app's local-file origin (`null`) if you choose to support it.

## Keep your existing tracking data

The iPhone app and Safari have separate local storage. In the web app, open **Settings → Export Backup**, save the JSON to Files, then open **Settings → Import Backup** in the iPhone app. Reconnect Apple Health after importing. Backups contain the saved activity summary, but importing never grants permission or automatically enables sync. Export in the native app opens Apple's share sheet so you can save a backup to Files.

## TestFlight or App Store

Direct installation from Xcode does not require a public App Store listing. TestFlight is another option if you want installation through an invitation link; it requires Apple Developer Program membership (currently US$99 per year, or local pricing where available). TestFlight builds expire after 90 days. Publishing on the App Store is optional and requires its own submission/review.

Apple's references: [personal-device installation and seven-day limit](https://developer.apple.com/help/account/basics/about-your-developer-account), [membership pricing](https://developer.apple.com/programs/whats-included/), [TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).

## Data behavior

- HealthKit permission is requested only after tapping **Connect Apple Health**. No Health data is written back to Apple, sent to a server, or used to change calorie targets or training recommendations.
- The app cannot tell whether an individual read permission was denied. Unavailable daily quantities display **—**, with instructions to check Health permissions. A completed permission request is never presented as proof that all access was granted.
- Move and Exercise use Apple's activity summary where available. Move supports both calorie-based and time-based rings. Standing minutes and standing hours are separate values. Workout duration uses recorded active duration and may differ from Exercise ring time.
- Steps and other daily quantities use HealthKit statistics queries to combine data sources, rather than adding raw Watch and iPhone samples together. Workout energy is shown per workout and is never added to the daily active-energy total.
- Each refresh replaces the complete 30-day snapshot. Stable HealthKit workout UUIDs prevent repeat-sync duplicates, and deletions in Apple Health disappear on the next successful refresh. Errors preserve the last successful summary and its sync timestamp.
- Sync runs while the app is visible and on return to the app. It does not promise delivery while the app is closed. **Disconnect & clear saved activity** stops refreshing and removes the local snapshot; revoke system permission separately in Apple Health.
- Only the bundled main page can call the native bridge. External links open outside the app; remote pages and child frames cannot request Health data.

## Verification

```sh
npm test
npm run build
npm run build:ios
xcodebuild -project ios/CalorieTrack.xcodeproj -scheme CalorieTrack \
  -destination 'generic/platform=iOS' -derivedDataPath /tmp/calorietrack-ios-build \
  CODE_SIGNING_ALLOWED=NO build
```

The Xcode build requires installed iOS platform support. Live HealthKit verification requires your iPhone and your permission. Check a day with Watch and iPhone steps, a walk/run/football workout, a day with no data, partially allowed permissions, a repeated refresh, a deleted workout, reopening the app after midnight, and disconnecting. Compare Move, Exercise and Stand values against Fitness after the Watch has synced.
