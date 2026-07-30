import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.solaya.quest"
    compileSdk = 34

    buildFeatures {
        buildConfig = true
    }

    val localProperties = Properties()
    val localPropertiesFile = rootProject.file("local.properties")
    if (localPropertiesFile.exists()) {
        localProperties.load(FileInputStream(localPropertiesFile))
    }
    
    defaultConfig {
        applicationId = "com.solaya.quest.v2"
        minSdk = 29
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
        
        buildConfigField("String", "GEMINI_API_KEY", "\"${localProperties.getProperty("GEMINI_API_KEY", "")}\"")
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
        freeCompilerArgs += listOf("-Xskip-metadata-version-check")
    }

    // Keep web assets uncompressed so NanoHTTPD can serve them with correct Content-Length
    androidResources {
        noCompress += listOf("html", "js", "css", "json", "mp3", "png", "jpg", "svg", "woff", "woff2")
    }
}

dependencies {
    // Pipecat Android SDK
    implementation("ai.pipecat:gemini-live-websocket-transport:1.2.0")
    
    // Required by Pipecat SDK for JsonElement resolution
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    // NanoHTTPD — lightweight embedded HTTP server & WebSocket
    implementation("org.nanohttpd:nanohttpd:2.3.1")
    implementation("org.nanohttpd:nanohttpd-websocket:2.3.1")

    // AndroidX
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
}

configurations.all {
    resolutionStrategy {
        force("androidx.core:core:1.12.0")
        force("androidx.core:core-ktx:1.12.0")
    }
}
