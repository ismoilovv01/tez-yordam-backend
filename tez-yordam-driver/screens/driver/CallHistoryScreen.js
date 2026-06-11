import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../../constants';
import { useLanguage } from '../../LanguageContext';

const STATUS_LABELS = {
  assigned:   { label: 'Qabul qilindi', color: '#2980b9' },
  on_the_way: { label: "Yo'lda",        color: '#e67e22' },
  arrived:    { label: 'Yetib bordi',   color: '#27ae60' },
  completed:  { label: 'Tugallangan',   color: '#27ae60' },
  cancelled:  { label: 'Bekor qilindi', color: '#e74c3c' },
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ', ' + d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

export default function CallHistoryScreen({ token, navigation }) {
  const { theme } = useLanguage();
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/driver/call-history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Xato yuz berdi');
        setHistory(data.calls || []);
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    })();
  }, [token]);

  const gradColors = theme.dark ? ['#0f3460', '#16213e'] : ['#4fc3f7', '#81c784'];

  const renderItem = ({ item }) => {
    const statusInfo = STATUS_LABELS[item.status] || { label: item.status, color: '#7f8c8d' };
    return (
      <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <View style={s.cardTop}>
          <Text style={[s.cardId, { color: theme.text }]}>🚑 #{item.id}</Text>
          <View style={[s.statusBadge, { backgroundColor: statusInfo.color + '25' }]}>
            <Text style={[s.statusBadgeText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
        </View>

        <View style={[s.row, { borderBottomColor: theme.cardBorder }]}>
          <Text style={[s.label, { color: theme.textSub }]}>🗓️ Sana</Text>
          <Text style={[s.val, { color: theme.text }]}>{formatDate(item.created_at)}</Text>
        </View>

        <View style={[s.row, { borderBottomColor: theme.cardBorder }]}>
          <Text style={[s.label, { color: theme.textSub }]}>📞 Bemor tel.</Text>
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.caller_phone}`)}>
            <Text style={[s.val, { color: '#3498db' }]}>{item.caller_phone || '—'}</Text>
          </TouchableOpacity>
        </View>

        <View style={[s.row, { borderBottomWidth: 0 }]}>
          <Text style={[s.label, { color: theme.textSub }]}>📍 Koordinata</Text>
          <TouchableOpacity onPress={() => {
            if (item.latitude && item.longitude) {
              Linking.openURL(`https://maps.google.com?q=${item.latitude},${item.longitude}`);
            }
          }}>
            <Text style={[s.val, { color: '#3498db' }]}>
              {item.latitude && item.longitude
                ? `${parseFloat(item.latitude).toFixed(4)}, ${parseFloat(item.longitude).toFixed(4)}`
                : '—'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[s.safe, { backgroundColor: theme.bg }]}>
      <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[s.header, { paddingTop: (insets.top || 0) + 12 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Chaqiruvlar tarixi</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {loading && (
        <View style={s.center}>
          <ActivityIndicator color="#4fc3f7" size="large" />
          <Text style={[s.loadingText, { color: theme.textSub }]}>Yuklanmoqda...</Text>
        </View>
      )}

      {!!error && <Text style={s.errorMsg}>⚠️ {error}</Text>}

      {!loading && !error && history.length === 0 && (
        <View style={s.center}>
          <Text style={s.emptyIcon}>📋</Text>
          <Text style={[s.emptyText, { color: theme.textSub }]}>Hali chaqiruvlar yo'q</Text>
        </View>
      )}

      {!loading && history.length > 0 && (
        <FlatList
          data={history}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center' },
  backBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15 },
  errorMsg: { color: '#e74c3c', textAlign: 'center', margin: 20 },
  card: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardId: { fontWeight: 'bold', fontSize: 16 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontWeight: '600', fontSize: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5 },
  label: { fontSize: 13 },
  val: { fontSize: 13, fontWeight: '500', maxWidth: '55%', textAlign: 'right' },
});
