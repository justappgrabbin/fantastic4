# Native Android Four Corners

Native Java Activity and Android device storage. No WebView, Python host, remote server or Internet permission. Independent of Synthai2.

Implemented: four separate directives, durable per-agent task queues, Android document picker, unchanged original package retention, SHA-256 inventory, native package detail screens, background import. Imports are inspected, never installed or executed. Models and original engines are not connected. Saved tasks explicitly wait for an engine; there is no simulated completion.

Build requirements: JDK 17+, Gradle 8.11.1, Android SDK platform 35 and build tools. From this directory run:

    gradle :app:assembleDebug

APK output: app/build/outputs/apk/debug/app-debug.apk

The current workspace has Java but lacks Gradle/Android SDK; outbound download failed at the environment proxy. This source has not been compiled or device tested. No APK has been produced.

Self-hosted execution is the intended architecture. Local inference and original engine adapters still require actual Android-compatible runtimes; adding these is necessary before autonomous building. The existing Python Yi Jing source has not been silently replaced with a claimed native implementation.

## GitHub build

The included Actions workflow installs SDK 35 and Gradle 8.11.1, assembles the APK, runs Android lint, checks its signature, and launches it on an emulator. It uploads the APK and evidence as `Four-Corners-native-Android`. A launch test does not verify unconnected agent engines. This directory is intended as the repository root.


Linux runtime selection is pending identification of the user-supplied 5.4/5.8 container. No generic container has been adopted.
