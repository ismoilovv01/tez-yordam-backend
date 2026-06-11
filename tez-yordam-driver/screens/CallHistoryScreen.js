import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Linking, SafeAreaView,
} from 'react-native';
import { API_URL } from '../constants';

const STATUS_LABELS = {
  pending:    { label: 'Kutilmoqda',   color: '#f39c12' },
  assigned:   { label: 'Tayinlangan',  color: '#2980b9' },
  on_the_way: { label: "Yo'lda",       color: '#e67e22' },
  arrived:    { label: 'Yetib bordi',  color: '#27ae60' },
  completed:  { label: 'Tugallangan',  color: '#27ae60' },
  rejected:   { label: 'Rad etilgan',  color: '#e74c3c' },
  cancelled:  { label: 'Bekor qilindi',color: '#95a5a6' },
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('ru-RU', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function CallHistoryScreen({ token, navigation }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch(`${API_URL}/api/driver/call-history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Xato yuz berdi');
        setHistory(data.calls || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const renderItem = ({ item }) => {
    const statusInfo = STATUS_LABELS[item.status] || { label: item.status, color: '#7f8c8d' };
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <Text style={s.cardId}>#{item.id}</Text>
          <View style={[s.statusBadge, { backgroundColor: statusInfo.color }]}>
            <Text style={s.statusBadgeText}>{statusInfo.label}</Text>
          </View>
        </View>

        <View style={s.row}>
          <Text style={s.label}>📅 Sana</Text>
          <Text style={s.val}>{formatDate(item.created_at)}</Text>
        </View>

        <View style={s.row}>
          <Text style={s.label}>📞 Bemor tel.</Text>
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.caller_phone}`)}>
            <Text style={[s.val, { color: '#3498db' }]}>{item.caller_phone || '—'}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.row}>
          <Text style={s.label}>📍 Koordinata</Text>
          <Text style={s.val}>
            {item.latitude && item.longitude
              ? `${parseFloat(item.latitude).toFixed(4)}, ${parseFloat(item.longitude).toFixed(4)}`
              : '—'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backBtnText}>← Orqaga</Text>
        </TouchableOpacity>
        <Text style={s.topbarTitle}>Chaqiruvlar tarixi</Text>
        <View style={{ width: 80 }} />
      </View>

      {loading && (
        <View style={s.center}>
          <ActivityIndicator color="#e74c3c" size="large" />
          <Text style={s.loadingText}>Yuklanmoqda...</Text>
        </View>
      )}

      {error ? <Text style={s.errorMsg}>⚠️ {error}</Text> : null}

      {!loading && !error && history.length === 0 && (
        <View style={s.center}>
          <Text style={s.emptyIcon}>📋</Text>
          <Text style={s.emptyText}>Hali chaqiruvlar yo'q</Text>
        </View>
      )}

      {!loading && history.length > 0 && (
        <FlatList
          data={history}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16 }}
          renderItem={renderItem}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: '#f5f5f5' },
  topbar:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#4fc3f7' },
  backBtn:        { width: 80 },
  backBtnText:    { color: '#fff', fontSize: 14 },
  topbarTitle:    { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText:    { color: '#666', marginTop: 12 },
  emptyIcon:      { fontSize: 48, marginBottom: 12 },
  emptyText:      { color: '#666', fontSize: 15 },
  errorMsg:       { color: '#e74c3c', textAlign: 'center', margin: 20 },
  card:           { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  cardTop:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardId:         { color: '#333', fontWeight: 'bold', fontSize: 16 },
  statusBadge:    { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  statusBadgeText:{ color: '#fff', fontWeight: 'bold', fontSize: 12 },
  row:            { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  label:          { color: '#666', fontSize: 13 },
  val:            { color: '#333', fontSize: 13, fontWeight: '500', maxWidth: '55%', textAlign: 'right' },
});
