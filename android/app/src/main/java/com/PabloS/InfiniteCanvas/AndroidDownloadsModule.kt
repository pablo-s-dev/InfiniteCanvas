package com.PabloS.InfiniteCanvas

import android.Manifest
import android.content.ClipData
import android.content.ContentResolver
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream

class AndroidDownloadsModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "AndroidDownloads"

  @ReactMethod
  fun saveToDownloads(
    sourceUri: String,
    requestedFilename: String,
    mimeType: String,
    promise: Promise,
  ) {
    var destinationUri: Uri? = null
    var legacyFile: File? = null

    try {
      val source = Uri.parse(sourceUri)
      val resolver = reactContext.contentResolver

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val filename = findUniqueMediaStoreFilename(
          resolver,
          sanitizeFilename(requestedFilename),
        )
        // Keep the row invisible to other apps until the full image is copied.
        val values = ContentValues().apply {
          put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
          put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
          put(
            MediaStore.MediaColumns.RELATIVE_PATH,
            "${Environment.DIRECTORY_DOWNLOADS}/",
          )
          put(MediaStore.MediaColumns.IS_PENDING, 1)
        }

        destinationUri = resolver.insert(
          MediaStore.Downloads.EXTERNAL_CONTENT_URI,
          values,
        ) ?: throw IllegalStateException("Could not create a file in Downloads.")

        copyUriToUri(resolver, source, destinationUri)

        val published = ContentValues().apply {
          put(MediaStore.MediaColumns.IS_PENDING, 0)
        }
        if (resolver.update(destinationUri, published, null, null) == 0) {
          throw IllegalStateException("Could not publish the drawing in Downloads.")
        }

        openDownloadedFile(destinationUri, mimeType)
        promise.resolve(filename)
        return
      }

      if (
        reactContext.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) !=
        PackageManager.PERMISSION_GRANTED
      ) {
        throw SecurityException("Storage permission is required to save to Downloads.")
      }

      @Suppress("DEPRECATION")
      val downloadsDirectory =
        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
      if (!downloadsDirectory.exists() && !downloadsDirectory.mkdirs()) {
        throw IllegalStateException("Could not create the Downloads folder.")
      }

      val savedFile = createUniqueFile(downloadsDirectory, sanitizeFilename(requestedFilename))
      legacyFile = savedFile
      openSource(resolver, source).use { input ->
        FileOutputStream(savedFile).use { output -> input.copyTo(output) }
      }
      MediaScannerConnection.scanFile(
        reactContext,
        arrayOf(savedFile.absolutePath),
        arrayOf(mimeType),
      ) { _, scannedUri ->
        scannedUri?.let { openDownloadedFile(it, mimeType) }
      }
      promise.resolve(savedFile.name)
    } catch (error: Exception) {
      destinationUri?.let { uri ->
        runCatching { reactContext.contentResolver.delete(uri, null, null) }
      }
      legacyFile?.delete()
      promise.reject(
        "android-download-failed",
        "Could not save the drawing to Downloads.",
        error,
      )
    }
  }

  private fun copyUriToUri(resolver: ContentResolver, source: Uri, destination: Uri) {
    val output = resolver.openOutputStream(destination, "w")
      ?: throw IllegalStateException("Could not open the Downloads file for writing.")

    output.use { outputStream ->
      openSource(resolver, source).use { input -> input.copyTo(outputStream) }
    }
  }

  private fun openDownloadedFile(uri: Uri, mimeType: String) {
    val intent = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, mimeType)
      clipData = ClipData.newUri(reactContext.contentResolver, "Downloaded drawing", uri)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    // Keep the successful download even when the device has no compatible viewer installed.
    runCatching { reactContext.startActivity(intent) }
  }

  private fun openSource(resolver: ContentResolver, source: Uri): InputStream =
    when (source.scheme) {
      "file" -> FileInputStream(
        File(source.path ?: throw IllegalArgumentException("The export path is missing.")),
      )
      else -> resolver.openInputStream(source)
        ?: throw IllegalStateException("Could not read the generated drawing image.")
    }

  private fun findUniqueMediaStoreFilename(
    resolver: ContentResolver,
    requestedName: String,
  ): String {
    val extension = requestedName.substringAfterLast('.', "")
    val baseName = if (extension.isEmpty()) {
      requestedName
    } else {
      requestedName.removeSuffix(".$extension")
    }
    val projection = arrayOf(MediaStore.MediaColumns.DISPLAY_NAME)
    val selection =
      "${MediaStore.MediaColumns.RELATIVE_PATH} = ? AND ${MediaStore.MediaColumns.DISPLAY_NAME} = ?"
    val relativePath = "${Environment.DIRECTORY_DOWNLOADS}/"

    fun exists(filename: String): Boolean = resolver.query(
      MediaStore.Downloads.EXTERNAL_CONTENT_URI,
      projection,
      selection,
      arrayOf(relativePath, filename),
      null,
    )?.use { it.moveToFirst() } ?: false

    var candidate = requestedName
    var suffix = 1
    while (exists(candidate)) {
      candidate = if (extension.isEmpty()) {
        "$baseName ($suffix)"
      } else {
        "$baseName ($suffix).$extension"
      }
      suffix += 1
    }
    return candidate
  }

  private fun sanitizeFilename(requestedName: String): String {
    val safeName = File(requestedName).name
      .replace(Regex("[^A-Za-z0-9._-]"), "_")
      .ifBlank { "drawing.png" }
    return safeName
  }

  private fun createUniqueFile(directory: File, requestedName: String): File {
    val extension = requestedName.substringAfterLast('.', "")
    val baseName = if (extension.isEmpty()) {
      requestedName
    } else {
      requestedName.removeSuffix(".$extension")
    }

    var candidate = File(directory, requestedName)
    var suffix = 1
    while (candidate.exists()) {
      val nextName = if (extension.isEmpty()) {
        "$baseName ($suffix)"
      } else {
        "$baseName ($suffix).$extension"
      }
      candidate = File(directory, nextName)
      suffix += 1
    }
    return candidate
  }
}
