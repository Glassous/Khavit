plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.glassous.khavit"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "com.glassous.khavit"
        minSdk = 33
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            // R8 代码压缩 + 资源裁剪；壳只用系统 API，没有第三方依赖需要保留
            optimization {
                enable = true
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    packaging {
        resources {
            // 壳里没有任何 Kotlin 代码，去掉内置 Kotlin 的元数据文件
            excludes += "kotlin/**"
        }
    }
}

// 这是一个纯 WebView 壳，刻意不引入 AppCompat / Material / Core 等依赖：
// 边到边、Insets、返回键都使用 minSdk 33 自带的框架 API。
dependencies {
}
