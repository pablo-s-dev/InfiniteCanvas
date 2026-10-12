package com.PabloS.InfiniteCanvas

import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.StandardIntegrityManager
import java.security.MessageDigest

class PlayIntegrityModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val manager = IntegrityManagerFactory.createStandard(reactContext)
  @Volatile private var provider: StandardIntegrityManager.StandardIntegrityTokenProvider? = null
  @Volatile private var preparedForProject: Long? = null

  override fun getName() = MODULE_NAME

  @ReactMethod
  fun requestIntegrityToken(canonicalRequest: String, cloudProjectNumber: String, promise: Promise) {
    if (canonicalRequest.length > MAX_CANONICAL_REQUEST_CHARS) {
      promise.reject("integrity_request_too_large", "The protected request is too large.")
      return
    }
    val projectNumber = cloudProjectNumber.toLongOrNull()
    if (projectNumber == null || projectNumber <= 0) {
      promise.reject("integrity_project_invalid", "The Play Integrity project is not configured.")
      return
    }

    val requestHash = try {
      val digest = MessageDigest.getInstance("SHA-256")
        .digest(canonicalRequest.toByteArray(Charsets.UTF_8))
      Base64.encodeToString(
        digest,
        Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
      )
    } catch (error: Exception) {
      promise.reject("integrity_hash_failed", "The protected request could not be prepared.", error)
      return
    }

    val cachedProvider = provider
    if (cachedProvider != null && preparedForProject == projectNumber) {
      requestToken(cachedProvider, requestHash, promise)
      return
    }

    val prepareRequest = StandardIntegrityManager.PrepareIntegrityTokenRequest.builder()
      .setCloudProjectNumber(projectNumber)
      .build()
    manager.prepareIntegrityToken(prepareRequest)
      .addOnSuccessListener { tokenProvider ->
        provider = tokenProvider
        preparedForProject = projectNumber
        requestToken(tokenProvider, requestHash, promise)
      }
      .addOnFailureListener { error ->
        promise.reject(
          "integrity_prepare_failed",
          error.message ?: "Google Play could not prepare app integrity verification.",
          error,
        )
      }
  }

  private fun requestToken(
    tokenProvider: StandardIntegrityManager.StandardIntegrityTokenProvider,
    requestHash: String,
    promise: Promise,
  ) {
    val request = StandardIntegrityManager.StandardIntegrityTokenRequest.builder()
      .setRequestHash(requestHash)
      .build()
    tokenProvider.request(request)
      .addOnSuccessListener { token -> promise.resolve(token.token()) }
      .addOnFailureListener { error ->
        provider = null
        preparedForProject = null
        promise.reject(
          "integrity_token_failed",
          error.message ?: "Google Play could not verify this app request.",
          error,
        )
      }
  }

  companion object {
    private const val MODULE_NAME = "InfiniteCanvasPlayIntegrity"
    private const val MAX_CANONICAL_REQUEST_CHARS = 6 * 1024 * 1024
  }
}
