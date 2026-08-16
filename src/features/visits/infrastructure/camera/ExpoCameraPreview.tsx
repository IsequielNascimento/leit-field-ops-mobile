import { CameraView } from 'expo-camera';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CameraCaptureOutcome } from '../../domain/services/CameraEvidenceService';
import { tokens } from '@/shared/presentation/theme';

interface ExpoCameraPreviewProps {
  onCancel: () => void;
  onOutcome: (outcome: CameraCaptureOutcome) => void;
}

export function ExpoCameraPreview({ onCancel, onOutcome }: ExpoCameraPreviewProps) {
  const cameraRef = useRef<CameraView>(null);
  const [isReady, setIsReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const capture = async () => {
    if (!cameraRef.current || !isReady || isCapturing) {
      return;
    }

    setIsCapturing(true);

    try {
      const picture = await cameraRef.current.takePictureAsync({ exif: false });
      onOutcome({ kind: 'captured', temporaryUri: picture.uri });
    } catch {
      onOutcome({ kind: 'failed', message: 'The camera could not capture a photo.' });
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView
        active
        facing="back"
        mode="picture"
        onCameraReady={() => setIsReady(true)}
        onMountError={() =>
          onOutcome({ kind: 'failed', message: 'The camera preview could not be opened.' })
        }
        ref={cameraRef}
        style={styles.camera}
      />
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          disabled={isCapturing}
          onPress={onCancel}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryLabel}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityHint="Captures the meter evidence photo"
          accessibilityRole="button"
          accessibilityState={{ busy: isCapturing, disabled: !isReady || isCapturing }}
          disabled={!isReady || isCapturing}
          onPress={() => void capture()}
          style={({ pressed }) => [
            styles.captureButton,
            (!isReady || isCapturing) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.captureLabel}>
            {isCapturing ? 'Capturing…' : isReady ? 'Capture photo' : 'Opening camera…'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  camera: {
    flex: 1,
    width: '100%',
  },
  captureButton: {
    alignItems: 'center',
    backgroundColor: tokens.colors.primary,
    borderColor: tokens.colors.textInverse,
    borderWidth: tokens.borders.width.strong,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: tokens.spacing.md,
  },
  captureLabel: {
    ...tokens.typography.action,
    color: tokens.colors.textInverse,
    textAlign: 'center',
  },
  container: {
    backgroundColor: tokens.colors.chrome,
    flex: 1,
  },
  controls: {
    backgroundColor: tokens.colors.chrome,
    flexDirection: 'row',
    gap: tokens.spacing.md,
    padding: tokens.spacing.lg,
  },
  disabled: {
    backgroundColor: tokens.colors.primaryDisabled,
  },
  pressed: {
    opacity: 0.72,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: tokens.colors.textInverse,
    borderWidth: tokens.borders.width.strong,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: tokens.spacing.lg,
  },
  secondaryLabel: {
    ...tokens.typography.action,
    color: tokens.colors.textInverse,
  },
});
