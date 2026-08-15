import { StyleSheet, Text, View } from 'react-native';

export function AppShellScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>LEIT Field Ops</Text>
      <Text>Project baseline ready.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    marginBottom: 8,
    fontSize: 24,
    fontWeight: '600',
  },
});
