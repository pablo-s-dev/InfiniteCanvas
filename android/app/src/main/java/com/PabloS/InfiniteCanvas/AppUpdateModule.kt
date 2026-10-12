package com.PabloS.InfiniteCanvas

import android.app.Activity
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability

class AppUpdateModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val appUpdateManager: AppUpdateManager = AppUpdateManagerFactory.create(reactContext)

  private val installStateListener = InstallStateUpdatedListener { state ->
    val payload = Arguments.createMap()
    when (state.installStatus()) {
      InstallStatus.PENDING, InstallStatus.DOWNLOADING, InstallStatus.INSTALLING -> {
        payload.putString("state", "downloading")
        payload.putDouble("bytesDownloaded", state.bytesDownloaded().toDouble())
        payload.putDouble("totalBytesToDownload", state.totalBytesToDownload().toDouble())
      }
      InstallStatus.DOWNLOADED -> payload.putString("state", "downloaded")
      InstallStatus.FAILED -> payload.putString("state", "failed")
      InstallStatus.CANCELED -> payload.putString("state", "canceled")
      else -> return@InstallStateUpdatedListener
    }
    emitUpdateState(payload)
  }

  private var listenerRegistered = false

  override fun getName() = MODULE_NAME

  override fun initialize() {
    super.initialize()
    appUpdateManager.registerListener(installStateListener)
    listenerRegistered = true
  }

  override fun invalidate() {
    if (listenerRegistered) {
      appUpdateManager.unregisterListener(installStateListener)
      listenerRegistered = false
    }
    super.invalidate()
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by NativeEventEmitter. Play events are emitted as they arrive.
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    // Required by NativeEventEmitter; listener lifetime is managed by the module.
  }

  @ReactMethod
  fun checkForUpdate(promise: Promise) {
    appUpdateManager.appUpdateInfo
      .addOnSuccessListener { info ->
        val state = appUpdateStatus(info)
        val result = Arguments.createMap()
        result.putString("state", state)
        if (state != "none") {
          result.putInt("availableVersionCode", info.availableVersionCode())
        }
        promise.resolve(result)
      }
      .addOnFailureListener { error ->
        Log.w(TAG, "Unable to check for an app update", error)
        promise.reject("update-check-failed", "Unable to check for an app update.", error)
      }
  }

  @ReactMethod
  fun startFlexibleUpdate(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("update-activity-unavailable", "The app is not in the foreground.")
      return
    }

    appUpdateManager.appUpdateInfo
      .addOnSuccessListener { info ->
        if (
          info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE ||
          !info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)
        ) {
          promise.reject("update-not-available", "The update is no longer available.")
          return@addOnSuccessListener
        }

        val options = AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build()
        appUpdateManager.startUpdateFlow(info, activity, options)
          .addOnSuccessListener { resultCode ->
            when (resultCode) {
              Activity.RESULT_OK -> promise.resolve(Arguments.createMap().apply {
                putBoolean("accepted", true)
              })
              Activity.RESULT_CANCELED -> promise.resolve(Arguments.createMap().apply {
                putBoolean("accepted", false)
              })
              else -> promise.reject(
                "update-flow-failed",
                "The update flow could not be completed (result $resultCode).",
              )
            }
          }
          .addOnFailureListener { error ->
            Log.w(TAG, "Unable to start the app update", error)
            promise.reject("update-start-failed", "Unable to start the app update.", error)
          }
      }
      .addOnFailureListener { error ->
        Log.w(TAG, "Unable to refresh app update information", error)
        promise.reject("update-check-failed", "Unable to start the app update.", error)
      }
  }

  @ReactMethod
  fun completeUpdate(promise: Promise) {
    appUpdateManager.completeUpdate()
      .addOnSuccessListener { promise.resolve(null) }
      .addOnFailureListener { error ->
        Log.w(TAG, "Unable to complete the app update", error)
        promise.reject("update-complete-failed", "Unable to complete the app update.", error)
      }
  }

  private fun appUpdateStatus(info: AppUpdateInfo): String =
    when {
      info.installStatus() == InstallStatus.DOWNLOADED -> "downloaded"
      info.installStatus() == InstallStatus.PENDING ||
        info.installStatus() == InstallStatus.DOWNLOADING ||
        info.installStatus() == InstallStatus.INSTALLING ||
        info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS ->
        "in-progress"
      info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
        info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE) -> "available"
      else -> "none"
    }

  private fun emitUpdateState(payload: WritableMap) {
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(UPDATE_STATE_EVENT, payload)
  }

  companion object {
    private const val MODULE_NAME = "InfiniteCanvasAppUpdate"
    private const val UPDATE_STATE_EVENT = "updateStateChanged"
    private const val TAG = "InfiniteCanvasUpdate"
  }
}
