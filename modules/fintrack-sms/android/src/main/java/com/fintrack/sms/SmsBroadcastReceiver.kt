package com.fintrack.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

class SmsBroadcastReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == "android.provider.Telephony.SMS_RECEIVED") {
            try {
                val msgs = Telephony.Sms.Intents.getMessagesFromIntent(intent)
                if (!msgs.isNullOrEmpty()) {
                    val sender = msgs[0].originatingAddress ?: ""
                    val timestamp = msgs[0].timestampMillis
                    val sb = StringBuilder()
                    for (msg in msgs) {
                        msg.messageBody?.let { sb.append(it) }
                    }
                    FinTrackSmsModule.emitSmsReceived(sender, sb.toString(), timestamp)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
