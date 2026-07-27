# Solaya Quest ProGuard Rules
# Keep NanoHTTPD classes (they use reflection)
-keep class fi.iki.elonen.** { *; }
-dontwarn fi.iki.elonen.**
