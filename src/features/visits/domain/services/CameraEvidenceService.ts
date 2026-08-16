export type CameraPermissionOutcome =
  | { kind: 'granted' }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'failed'; message: string };

export type CameraCaptureOutcome =
  | { kind: 'captured'; temporaryUri: string }
  | { kind: 'cancelled' }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'failed'; message: string };

export type VisitPhotoEvidenceResult =
  | { kind: 'captured'; photoUri: string }
  | { kind: 'cancelled' }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'failed'; message: string };

export interface CameraPermissionGateway {
  requestPermission(): Promise<CameraPermissionOutcome>;
}

export interface DurablePhotoStorage {
  preserveCapture(temporaryUri: string): Promise<string>;
}
