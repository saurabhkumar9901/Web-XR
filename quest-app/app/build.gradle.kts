plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.solaya.quest"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.solaya.quest"
        minSdk = 29
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    // Keep web assets uncompressed so NanoHTTPD can serve them with correct Content-Length
    androidResources {
        noCompress += listOf("html", "js", "css", "json", "mp3", "png", "jpg", "svg", "woff", "woff2")
    }
}

dependencies {
    // NanoHTTPD — lightweight embedded HTTP server
    implementation("org.nanohttpd:nanohttpd:2.3.1")

    // AndroidX
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
}
