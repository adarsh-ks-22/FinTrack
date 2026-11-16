// ============================================================
// src/services/backupService.ts
// Local JSON database backup and sharing service.
// Saves structured WatermelonDB tables to a local JSON file
// and triggers native file sharing / save to device.
// ============================================================

import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { exportDatabaseBackupJSON } from '@/db/database';

export async function exportDatabaseBackup(): Promise<{ filePath: string; success: boolean }> {
  try {
    const jsonString = await exportDatabaseBackupJSON();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `FinTrack_Backup_${timestamp}.json`;
    const docDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    const filePath = `${docDir}${filename}`;

    await FileSystem.writeAsStringAsync(filePath, jsonString, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(filePath, {
        mimeType: 'application/json',
        dialogTitle: 'Export FinTrack Database Backup',
        UTI: 'public.json',
      });
    }

    return { filePath, success: true };
  } catch (error) {
    console.error('[backupService] Failed to export database backup:', error);
    throw error;
  }
}
