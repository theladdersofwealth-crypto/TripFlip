# TripFlip Android preview

Sideload-only preview, not the Google Play app. Package: `co.kr.tripflip.preview`.
The installed shell opens https://tripflip.co.kr/ in a WebView. Changes deployed
to the website do not require a new APK. Reopen the app from a cold start to
reload the site. HTTPS off-site links and account entry open the system browser.
A browser login does not set a session in the preview WebView.

To rebuild, use a JDK and Android SDK Platform 35 / Build Tools 35.0.0.
From the repository root, set `ANDROID_HOME`, `TRIPFLIP_SIGN_KEYSTORE` and
`TRIPFLIP_SIGN_PASS`; run `bash android-preview/build.sh /absolute/path/output.apk`.
Use the same signing key and increment the manifest version code to update a
previous install. Keep the private key and credentials out of GitHub and the APK.
