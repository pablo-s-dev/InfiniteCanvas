import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { googleDriveSync } from "./googleDriveSync";

export const CLOUD_SYNC_BACKGROUND_TASK = "infinite-canvas-cloud-sync-v1";

TaskManager.defineTask(CLOUD_SYNC_BACKGROUND_TASK, async () => {
  try {
    const account = await googleDriveSync.restoreAccount();
    if (!account || !account.entitlement.active || account.drive !== "ready") return BackgroundTask.BackgroundTaskResult.Success;
    const {runCloudSync} = await import("./syncEngine");
    const result = await runCloudSync(account);
    return result.failures ? BackgroundTask.BackgroundTaskResult.Failed : BackgroundTask.BackgroundTaskResult.Success;
  } catch { return BackgroundTask.BackgroundTaskResult.Failed; }
});

export async function registerCloudSyncBackgroundTask(): Promise<void> {
  if (Platform.OS === "web") return;
  const tasks = await TaskManager.getRegisteredTasksAsync();
  if (tasks.some((task) => task.taskName === CLOUD_SYNC_BACKGROUND_TASK)) return;
  await BackgroundTask.registerTaskAsync(CLOUD_SYNC_BACKGROUND_TASK, {
    minimumInterval: 15,
  });
}
