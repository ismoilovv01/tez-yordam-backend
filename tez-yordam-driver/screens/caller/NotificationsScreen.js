import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../../constants';
import { useLanguage } from '../../LanguageContext';

const STATUS_COLOR = {
  new: '#f39c12', confirmed: '#3498db', assigned: '#9b59b6',
  on_the_way: '#e67e22', arrived: '#27ae60', completed: '#27ae60', cancelled: '#e74c3c',
};

const STATUS_LABEL_UZ = {
  new: 'Yangi', confirmed: 'Tasdiqlandi', assigned: 'Qabul qilindi',
  on_the_way: "Yo'lda", arrived: 'Keldi', completed: 'Tugallangan', cancelled: 'Bekor qilindi',
};

export default function CallerNotificationsScreen({ token, navigation }) {
  const { t, theme } = useLanguage();
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/emergencies/my/history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setHistory(await res.json());
      } catch {}
      setLoading(false);
    })();
  }, [token]);

  const formatDate = (str) => {
    if (!str) return '';
    const d = new Date(str);
    return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ', ' + d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  };

  const gradColors = theme.dark ? ['#0f3460', '#16213e'] : ['#4fc3f7', '#81c784'];

  const serviceIcon = (type) => type === 'police' ? '🛡️' : type === 'fire' ? '🔥' : '🚑';

  return (
    <View style={[s.safe, { backgroundColor: theme.bg }]}>
      <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[s.header, { paddingTop: (insets.top || 0) + 12 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t.notifications}</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <View style={[s.content, { backgroundColor: theme.bg }]}>
        {loading ? (
          <ActivityIndicator color="#4fc3f7" style={{ marginTop: 60 }} />
        ) : history.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📋</Text>
            <Text style={[s.emptyText, { color: theme.textSub }]}>{t.noHistory}</Text>
          </View>
        ) : (
          <FlatList
            data={history}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}
            renderItem={({ item }) => (
              <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                {/* Header row */}
                <View style={s.cardHeader}>
                  <Text style={[s.cardId, { color: theme.text }]}>
                    {serviceIcon(item.service_type)} #{item.id}
                  </Text>
                  <View style={[s.badge, { backgroundColor: (STATUS_COLOR[item.status] || '#aaa') + '25' }]}>
                    <Text style={[s.badgeText, { color: STATUS_COLOR[item.status] || '#aaa' }]}>
                      {STATUS_LABEL_UZ[item.status] || item.status}
                    </Text>
                  </View>
                </View>

                {/* Details */}
                <View style={s.detailRow}>
                  <Text style={s.detailIcon}>🗓️</Text>
                  <Text style={[s.detailLabel, { color: theme.textSub }]}>{t.date || 'Sana'}</Text>
                  <Text style={[s.detailValue, { color: theme.text }]}>{formatDate(item.created_at)}</Text>
                </View>

                {item.caller_phone && (
                  <TouchableOpacity style={s.detailRow} onPress={() => Linking.openURL(`tel:${item.caller_phone}`)}>
                    <Text style={s.detailIcon}>📞</Text>
                    <Text style={[s.detailLabel, { color: theme.textSub }]}>Bemor tel.</Text>
                    <Text style={[s.detailValue, { color: '#3498db' }]}>{item.caller_phone}</Text>
                  </TouchableOpacity>
                )}

                <View style={s.detailRow}>
                  <Text style={s.detailIcon}>📍</Text>
                  <Text style={[s.detailLabel, { color: theme.textSub }]}>{t.coordinate || 'Koordinata'}</Text>
                  <TouchableOpacity onPress={() => {
                    const lat = parseFloat(item.latitude);
                    const lng = parseFloat(item.longitude);
                    if (!isNaN(lat) && !isNaN(lng))
                      Linking.openURL(`https://maps.google.com?q=${lat.toFixed(4)},${lng.toFixed(4)}`);
                  }}>
                    <Text style={[s.detailValue, { color: '#3498db' }]}>
                      {!isNaN(parseFloat(item.latitude)) && !isNaN(parseFloat(item.longitude))
                        ? `${parseFloat(item.latitude).toFixed(4)}, ${parseFloat(item.longitude).toFixed(4)}`
                        : '—'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {item.driver_name && (
                  <View style={s.detailRow}>
                    <Text style={s.detailIcon}>🚑</Text>
                    <Text style={[s.detailLabel, { color: theme.textSub }]}>{t.roleDriver || 'Driver'}</Text>
                    <Text style={[s.detailValue, { color: theme.text }]}>{item.driver_name}</Text>
                  </View>
                )}
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center' },
  backBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  content: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15 },
  card: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardId: { fontSize: 16, fontWeight: '700' },
  badge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 0.5, borderTopColor: '#f0f0f0' },
  detailIcon: { fontSize: 14, width: 24 },
  detailLabel: { fontSize: 13, width: 90 },
  detailValue: { fontSize: 13, fontWeight: '500', flex: 1, textAlign: 'right' },
});
