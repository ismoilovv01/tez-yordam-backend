import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';

export default function CallerRoleScreen({ onSelectRole }) {
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.iconContainer}>
          <Text style={s.icon}>🚑</Text>
        </View>
        <Text style={s.title}>Tez Yordam</Text>
          <Text style={s.subtitle}>Tez tibbiy yordam tizimi</Text>
        
        <View style={s.cardContainer}>
          <TouchableOpacity 
            style={s.card} 
            onPress={() => onSelectRole('caller')}
          >
            <Text style={s.cardIcon}>👤</Text>
            <Text style={s.cardTitle}>Foydalanuvchi</Text>
            <Text style={s.cardSubtitle}>Chaqiruv yuborish uchun</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={s.card} 
            onPress={() => onSelectRole('driver')}
          >
            <Text style={s.cardIcon}>🚗</Text>
            <Text style={s.cardTitle}>Haydovchi</Text>
            <Text style={s.cardSubtitle}>Haydovchi ilovasi uchun</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#4fc3f7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  icon: { fontSize: 48 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 40 },
  cardContainer: { width: '100%', gap: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  cardIcon: { fontSize: 40, marginBottom: 12 },
  cardTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: '#666' },
});
