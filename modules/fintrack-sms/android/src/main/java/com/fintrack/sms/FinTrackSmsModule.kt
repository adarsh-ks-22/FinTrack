package com.fintrack.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.provider.Telephony
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FinTrackSmsModule : Module() {
  companion object {
    private var instance: FinTrackSmsModule? = null

    fun emitSmsReceived(sender: String, body: String, timestamp: Long) {
      instance?.sendEvent("onSmsReceived", mapOf(
        "sender" to sender,
        "body" to body,
        "date" to timestamp
      ))
    }
  }

  private var dynamicReceiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("FinTrackSms")

    Events("onSmsReceived")

    OnCreate {
      instance = this@FinTrackSmsModule
      try {
        val context = appContext.reactContext
        if (context != null) {
          val filter = IntentFilter("android.provider.Telephony.SMS_RECEIVED")
          filter.priority = 1000
          dynamicReceiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
              if (intent?.action == "android.provider.Telephony.SMS_RECEIVED") {
                try {
                  val msgs = Telephony.Sms.Intents.getMessagesFromIntent(intent)
                  if (!msgs.isNullOrEmpty()) {
                    val sender = msgs[0].originatingAddress ?: ""
                    val timestamp = msgs[0].timestampMillis
                    val sb = StringBuilder()
                    for (m in msgs) {
                      m.messageBody?.let { sb.append(it) }
                    }
                    emitSmsReceived(sender, sb.toString(), timestamp)
                  }
                } catch (e: Exception) {
                  e.printStackTrace()
                }
              }
            }
          }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(dynamicReceiver, filter, Context.RECEIVER_EXPORTED)
          } else {
            context.registerReceiver(dynamicReceiver, filter)
          }
        }
      } catch (e: Exception) {
        e.printStackTrace()
      }
    }

    OnDestroy {
      try {
        val context = appContext.reactContext
        if (context != null && dynamicReceiver != null) {
          context.unregisterReceiver(dynamicReceiver)
          dynamicReceiver = null
        }
      } catch (e: Exception) {
        e.printStackTrace()
      }
      if (instance == this@FinTrackSmsModule) {
        instance = null
      }
    }

    AsyncFunction("readSmsInbox") { limit: Int, sinceTimestamp: Long ->
      val smsList = mutableListOf<Map<String, Any>>()
      val context = appContext.reactContext ?: return@AsyncFunction smsList

      try {
        val inboxUri = Uri.parse("content://sms/inbox")
        val selection = if (sinceTimestamp > 0) "date > ?" else null
        val selectionArgs = if (sinceTimestamp > 0) arrayOf(sinceTimestamp.toString()) else null
        val sortOrder = "date DESC"

        val cursor = context.contentResolver.query(
          inboxUri,
          arrayOf("_id", "address", "body", "date"),
          selection,
          selectionArgs,
          sortOrder
        )

        cursor?.use {
          val idIndex = it.getColumnIndex("_id")
          val addressIndex = it.getColumnIndex("address")
          val bodyIndex = it.getColumnIndex("body")
          val dateIndex = it.getColumnIndex("date")

          var count = 0
          while (it.moveToNext() && (limit <= 0 || count < limit)) {
            val id = if (idIndex >= 0) it.getString(idIndex) ?: "" else ""
            val address = if (addressIndex >= 0) it.getString(addressIndex) ?: "" else ""
            val body = if (bodyIndex >= 0) it.getString(bodyIndex) ?: "" else ""
            val date = if (dateIndex >= 0) it.getLong(dateIndex) else 0L

            if (body.isNotBlank()) {
              val item = mapOf(
                "id" to id,
                "address" to address,
                "body" to body,
                "date" to date
              )
              smsList.add(item)
              count++
            }
          }
        }
      } catch (e: Exception) {
        e.printStackTrace()
      }

      return@AsyncFunction smsList
    }
  }
}
