plugins {
    alias(libs.plugins.agp)
    alias(libs.plugins.kotlinAndroid)
}

android {
    namespace = "com.spotiduck.tv"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.spotiduck.tv"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        vectorDrawables.useSupportLibrary = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }

    buildFeatures {
        viewBinding = false
    }

    sourceSets {
        getByName("main") {
            assets.srcDir("assets")
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.media)
    implementation(libs.androidx.webkit)
}
