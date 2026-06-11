import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Linking, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../LanguageContext';

const NUMBERS = [
  { number: '103', uz: 'Tez Yordam',        ru: 'Скорая помощь',    en: 'Ambulance',       icon: '🚑', color: '#e74c3c', bg: '#ffebee' },
  { number: '102', uz: 'Politsiya',          ru: 'Полиция',          en: 'Police',          icon: '🛡️', color: '#1565c0', bg: '#e3f2fd' },
  { number: '101', uz: "Yong'in xizmati",   ru: 'Пожарная служба',  en: 'Fire Department', icon: '🔥', color: '#bf360c', bg: '#fff3e0' },
  { number: '104', uz: 'Gaz xizmati',       ru: 'Газовая служба',   en: 'Gas Service',     icon: '⚠️', color: '#f57f17', bg: '#fffde7' },
  { number: '117', uz: 'Milliy gvardiya',   ru: 'Нацгвардия',       en: 'National Guard',  icon: '🪖', color: '#2e7d32', bg: '#e8f5e9' },
  { number: '1050', uz: 'Favqulodda vaziyat', ru: 'МЧС',            en: 'Emergency Mgmt',  icon: '🆘', color: '#6a1b9a', bg: '#f3e5f5' },
  { number: '112', uz: 'Yagona raqam',      ru: 'Единый номер',     en: 'Single Emergency', icon: '📞', color: '#37474f', bg: '#eceff1' },
];

export default function EmergencyNumbersScreen({ navigation }) {
  const { t, lang, theme } = useLanguage();
  const insets = useSafeAreaInsets();

  const getName = (item) => {
    if (lang === 'ru') return item.ru;
    if (lang === 'en') return item.en;
    return item.uz;
  };

  const handleCall = (number, name) => {
    Alert.alert(
      `📞 ${name}`,
      `${number} ${t.callConfirm}`,
      [
        { text: t.no, style: 'cancel' },
        { text: `📞 ${t.call}`, onPress: () => Linking.openURL(`tel:${number}`) },
      ]
    );
  };

  const gradColors = theme.dark ? ['#0f3460', '#16213e'] : ['#4fc3f7', '#81c784'];

  return (
    <View style={[s.safe, { backgroundColor: theme.bg }]}>
      <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, { paddingTop: (insets.top || 0) + 12 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>📞 {t.emergencyNumbers}</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView style={[s.content, { backgroundColor: theme.bg }]} contentContainerStyle={s.contentInner} showsVerticalScrollIndicator={false}>
        <Text style={[s.subtitle, { color: theme.textSub }]}>{t.emergencyNumbersSubtitle}</Text>

        {NUMBERS.map((item) => (
          <TouchableOpacity
            key={item.number}
            style={[s.card, { backgroundColor: theme.dark ? theme.cardBg : item.bg, borderColor: theme.dark ? theme.cardBorder : item.color + '40' }]}
            onPress={() => handleCall(item.number, getName(item))}
            activeOpacity={0.7}
          >
            <View style={[s.iconBox, { backgroundColor: item.color + '20' }]}>
              <Text style={s.icon}>{item.icon}</Text>
            </View>
            <View style={s.cardInfo}>
              <Text style={[s.cardName, { color: theme.text }]}>{getName(item)}</Text>
              <Text style={[s.cardSub, { color: theme.textSub }]}>
                {lang !== 'uz' ? item.uz : `${item.ru} / ${item.en}`}
              </Text>
            </View>
            <TouchableOpacity
              style={[s.numberBadge, { backgroundColor: item.color }]}
              onPress={() => handleCall(item.number, getName(item))}
            >
              <Text style={s.numberText}>{item.number}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))}

        <View style={[s.note, { backgroundColor: theme.dark ? theme.cardBg : 'rgba(0,0,0,0.05)' }]}>
          <Text style={[s.noteText, { color: theme.textSub }]}>
            ℹ️ {t.emergencyNumbersNote}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center' },
  backBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  content: { flex: 1 },
  contentInner: { padding: 16, paddingBottom: 40 },
  subtitle: { fontSize: 13, textAlign: 'center', marginBottom: 16, marginTop: 4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1.5 },
  iconBox: { width: 46, height: 46, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  icon: { fontSize: 22 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 14, fontWeight: '600' },
  cardSub: { fontSize: 11, marginTop: 2 },
  numberBadge: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, flexShrink: 0 },
  numberText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  note: { marginTop: 8, padding: 14, borderRadius: 12 },
  noteText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
