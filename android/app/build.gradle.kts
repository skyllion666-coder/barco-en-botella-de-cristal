plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.skyllion.barcobotella"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.skyllion.barcobotella"
        minSdk = 24
        targetSdk = 36
        versionCode = 17
        versionName = "17"
    }

    // Misma clave que el resto de apps (release.keystore, alias chess_release).
    // La contraseña se toma de ~/.gradle/gradle.properties (SKYLLION_STORE_PASSWORD), no de este archivo.
    signingConfigs {
        create("release") {
            storeFile = file("/home/skyllion/release.keystore")
            storePassword = providers.gradleProperty("SKYLLION_STORE_PASSWORD").get()
            keyAlias = "chess_release"
            keyPassword = providers.gradleProperty("SKYLLION_STORE_PASSWORD").get()
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }

    packaging { resources { excludes += "META-INF/*" } }
    androidResources { noCompress += listOf("html", "glb") }
    kotlinOptions { jvmTarget = "1.8" }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.webkit:webkit:1.8.0")
}
