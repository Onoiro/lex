# Android APK build environment for Lex (Capacitor).
#
# JDK 21 is required by Capacitor 8 / AGP 8.x (see capacitor.build.gradle:
# sourceCompatibility JavaVersion.VERSION_21). The Android SDK matches
# client/android/variables.gradle: platform 36 + build-tools 36.0.0.
#
# The Gradle cache is mounted from the host (see the android-apk target in the
# Makefile) so repeated builds do not re-download dependencies.
#
# Build:  docker build -f docker/android/Dockerfile -t lex-android-builder docker/android
# Usage:  make android-apk

FROM eclipse-temurin:21-jdk-jammy

ARG CMDLINE_TOOLS_VERSION=11076708
ARG ANDROID_PLATFORM=36
ARG ANDROID_BUILD_TOOLS=36.0.0

ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH="${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/build-tools/${ANDROID_BUILD_TOOLS}:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends unzip curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p "${ANDROID_HOME}/cmdline-tools" \
    && curl -fsSL -o /tmp/cmdline-tools.zip \
        "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS_VERSION}_latest.zip" \
    && unzip -q /tmp/cmdline-tools.zip -d /tmp/cmdline-tools \
    && mv /tmp/cmdline-tools/cmdline-tools "${ANDROID_HOME}/cmdline-tools/latest" \
    && rm -rf /tmp/cmdline-tools /tmp/cmdline-tools.zip

RUN yes | sdkmanager --licenses > /dev/null \
    && sdkmanager --install \
        "platform-tools" \
        "platforms;android-${ANDROID_PLATFORM}" \
        "build-tools;${ANDROID_BUILD_TOOLS}" > /dev/null

# Gradle writes its caches here; the host mounts a writable directory over it.
ENV GRADLE_USER_HOME=/gradle-cache

# The container runs as the host user (see the android-apk target) so build
# artifacts are not owned by root. That user has no passwd entry, so give it a
# writable HOME and relax permissions on the SDK and cache directories.
RUN mkdir -p /tmp/home /gradle-cache \
    && chmod -R a+rwX "${ANDROID_HOME}" /gradle-cache /tmp/home

WORKDIR /workspace
