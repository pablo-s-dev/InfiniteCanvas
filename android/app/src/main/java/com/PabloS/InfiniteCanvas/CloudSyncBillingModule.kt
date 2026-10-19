package com.PabloS.InfiniteCanvas

import android.util.Log
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class CloudSyncBillingModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), PurchasesUpdatedListener {
  private val billingClient: BillingClient = BillingClient.newBuilder(reactContext)
    .setListener(this)
    .enablePendingPurchases(
      PendingPurchasesParams.newBuilder().enableOneTimeProducts().build(),
    )
    .enableAutoServiceReconnection()
    .build()

  private var pendingPurchasePromise: Promise? = null

  override fun getName() = MODULE_NAME

  @ReactMethod
  fun getCloudSyncStatus(promise: Promise) {
    withBillingConnection(promise) {
      queryProductDetails { product, productError ->
        billingClient.queryPurchasesAsync(
          QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP)
            .build(),
        ) { result, purchases ->
          if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            promise.reject(
              "billing-purchases-failed",
              result.debugMessage.ifBlank { "Could not check Google Play purchases." },
            )
            return@queryPurchasesAsync
          }

          val ownedPurchases = purchases.orEmpty().filter { PRODUCT_ID in it.products }
          val purchaseTokens = Arguments.createArray()
          ownedPurchases.forEach { purchase ->
            val state = when (purchase.purchaseState) {
              com.android.billingclient.api.Purchase.PurchaseState.PURCHASED -> "purchased"
              com.android.billingclient.api.Purchase.PurchaseState.PENDING -> "pending"
              else -> null
            }
            if (state != null) {
              purchaseTokens.pushMap(Arguments.createMap().apply {
                putString("status", state)
                putString("purchaseToken", purchase.purchaseToken)
              })
            }
          }

          val offer = product?.oneTimePurchaseOfferDetailsList?.firstOrNull()
          val status = Arguments.createMap().apply {
            putBoolean("productAvailable", product != null && offer != null)
            putArray("purchases", purchaseTokens)
            if (offer != null) {
              putString("formattedPrice", offer.formattedPrice)
              putString("currencyCode", offer.priceCurrencyCode)
            }
            if (product == null && productError != null) {
              putString("productError", productError)
            }
          }
          promise.resolve(status)
        }
      }
    }
  }

  @ReactMethod
  fun purchaseCloudSync(accountBinding: String, promise: Promise) {
    if (accountBinding.length !in 32..64 || !accountBinding.matches(Regex("[A-Za-z0-9_-]+"))) {
      promise.reject("cloud-sync-account-binding-invalid", "The Cloud Sync account could not be verified.")
      return
    }
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("billing-activity-unavailable", "The app is not in the foreground.")
      return
    }
    if (pendingPurchasePromise != null) {
      promise.reject("billing-purchase-in-progress", "A purchase is already in progress.")
      return
    }

    withBillingConnection(promise) {
      queryProductDetails { product, productError ->
        if (product == null) {
          promise.reject(
            "cloud-sync-product-unavailable",
            productError ?: "The Cloud Sync product is not available in Google Play.",
          )
          return@queryProductDetails
        }
        val offer = product.oneTimePurchaseOfferDetailsList?.firstOrNull()
        if (offer == null) {
          promise.reject(
            "cloud-sync-offer-unavailable",
            "The Cloud Sync purchase option is not available for this account.",
          )
          return@queryProductDetails
        }
        val offerToken = offer.offerToken
        if (offerToken.isNullOrBlank()) {
          promise.reject(
            "cloud-sync-offer-token-unavailable",
            "The Cloud Sync purchase option has no active offer token.",
          )
          return@queryProductDetails
        }

        val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
          .setProductDetails(product)
          .setOfferToken(offerToken)
          .build()
        val params = BillingFlowParams.newBuilder()
          .setProductDetailsParamsList(listOf(productParams))
          .setObfuscatedAccountId(accountBinding)
          .build()

        pendingPurchasePromise = promise
        val launchResult = billingClient.launchBillingFlow(activity, params)
        if (launchResult.responseCode != BillingClient.BillingResponseCode.OK) {
          pendingPurchasePromise = null
          promise.reject(
            "billing-flow-failed",
            launchResult.debugMessage.ifBlank { "Could not open Google Play checkout." },
          )
        }
      }
    }
  }

  override fun onPurchasesUpdated(
    billingResult: BillingResult,
    purchases: MutableList<com.android.billingclient.api.Purchase>?,
  ) {
    val promise = pendingPurchasePromise ?: return
    pendingPurchasePromise = null

    when (billingResult.responseCode) {
      BillingClient.BillingResponseCode.OK -> {
        val cloudSyncPurchase = purchases.orEmpty().firstOrNull { PRODUCT_ID in it.products }
        when (cloudSyncPurchase?.purchaseState) {
          com.android.billingclient.api.Purchase.PurchaseState.PURCHASED -> {
            promise.resolve(purchaseResult("purchased", cloudSyncPurchase.purchaseToken))
          }
          com.android.billingclient.api.Purchase.PurchaseState.PENDING ->
            promise.resolve(purchaseResult("pending", cloudSyncPurchase.purchaseToken))
          else -> promise.reject(
            "billing-purchase-not-completed",
            "Google Play did not confirm the Cloud Sync purchase.",
          )
        }
      }
      BillingClient.BillingResponseCode.USER_CANCELED ->
        promise.resolve(purchaseResult("canceled"))
      else -> promise.reject(
        "billing-purchase-failed",
        billingResult.debugMessage.ifBlank { "Google Play could not complete the purchase." },
      )
    }
  }

  private fun queryProductDetails(callback: (ProductDetails?, String?) -> Unit) {
    val product = QueryProductDetailsParams.Product.newBuilder()
      .setProductId(PRODUCT_ID)
      .setProductType(BillingClient.ProductType.INAPP)
      .build()
    val params = QueryProductDetailsParams.newBuilder()
      .setProductList(listOf(product))
      .build()

    Log.d(TAG, "queryProductDetails for productId=$PRODUCT_ID")
    billingClient.queryProductDetailsAsync(params) { result, queryResult ->
      Log.d(TAG, "queryProductDetails responseCode=${result.responseCode}, debugMessage=${result.debugMessage}")
      if (result.responseCode != BillingClient.BillingResponseCode.OK) {
        callback(null, result.debugMessage.ifBlank { "Could not load the Cloud Sync price." })
        return@queryProductDetailsAsync
      }
      val matchedProduct = queryResult.productDetailsList.firstOrNull { it.productId == PRODUCT_ID }
      Log.d(TAG, "queryProductDetails matchedProduct=$matchedProduct")
      callback(
        matchedProduct,
        queryResult.unfetchedProductList.firstOrNull()?.let { it.statusCode.toString() },
      )
    }
  }

  private fun withBillingConnection(promise: Promise, action: () -> Unit) {
    if (billingClient.isReady) {
      action()
      return
    }

    billingClient.startConnection(object : BillingClientStateListener {
      override fun onBillingSetupFinished(result: BillingResult) {
        if (result.responseCode == BillingClient.BillingResponseCode.OK) {
          action()
        } else {
          promise.reject(
            "billing-connection-failed",
            result.debugMessage.ifBlank { "Could not connect to Google Play." },
          )
        }
      }

      override fun onBillingServiceDisconnected() {
        // The library reconnects automatically before the next billing operation.
      }
    })
  }

  private fun purchaseResult(status: String, purchaseToken: String? = null) = Arguments.createMap().apply {
    putString("status", status)
    if (purchaseToken != null) putString("purchaseToken", purchaseToken)
  }

  override fun invalidate() {
    billingClient.endConnection()
    super.invalidate()
  }

  companion object {
    private const val TAG = "InfiniteCanvasBilling"
    private const val MODULE_NAME = "InfiniteCanvasCloudSyncBilling"
    private const val PRODUCT_ID = "cloud_sync_unlock"
  }
}
