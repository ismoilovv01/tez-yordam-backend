import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL } from '../../constants';
import { useLanguage } from '../../LanguageContext';

export default function FeedbackScreen({ navigation, route, token }) {
  const { t, theme } = useLanguage();
  const { emergencyId, type = 'general', afterCall = false, homeScreen = 'CallerHome' } = route?.params || {};

  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim() && rating === 0) {
      Alert.alert(t.error, t.feedbackRequired || 'Iltimos baho bering yoki fikr yozing');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/feedback`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: rating || null, message: message.trim() || null, emergency_id: emergencyId || null, type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.error);
      setSent(true);
    } catch (err) {
      Alert.alert(t.error, t.feedbackError || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    if (afterCall) {
      navigation.navigate(homeScreen);
    } else {
      navigation.goBack();
    }
  };

  const stars = [1, 2, 3, 4, 5];

  if (sent) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
        <View style={s.successContainer}>
          <Text style={s.successIcon}>🎉</Text>
          <Text style={[s.successTitle, { color: theme.text }]}>{t.feedbackSent || 'Fikringiz qabul qilindi!'}</Text>
          <Text style={[s.successSub, { color: theme.textSub }]}>Rahmat 🙏</Text>
          <TouchableOpacity style={[s.doneBtn, { backgroundColor: '#4fc3f7' }]} onPress={handleDone}>
            <Text style={s.doneBtnText}>OK</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={s.header}>
            {!afterCall && (
              <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                <Text style={[s.backBtnText, { color: theme.text }]}>←</Text>
              </TouchableOpacity>
            )}
            <Text style={[s.title, { color: theme.text }]}>{t.feedbackTitle || 'Fikr bildirish'}</Text>
            <Text style={[s.sub, { color: theme.textSub }]}>
              {emergencyId ? (t.rateCall || 'Chaqiruvni baholang') : (t.feedbackSub || 'Xizmat haqida fikringizni qoldiring')}
            </Text>
          </View>

          {/* Star rating */}
          <View style={[s.card, { backgroundColor: theme.card }]}>
            <Text style={[s.sectionLabel, { color: theme.textSub }]}>{t.feedbackRating || 'Baholang'}</Text>
            <View style={s.starsRow}>
              {stars.map((star) => (
                <TouchableOpacity key={star} onPress={() => setRating(star)} style={s.starBtn}>
                  <Text style={[s.star, { color: star <= rating ? '#f39c12' : '#ddd' }]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>
            {rating > 0 && (
              <Text style={[s.ratingLabel, { color: '#f39c12' }]}>
                {['', '😞 Yomon', '😐 Qoniqarsiz', '🙂 Normal', '😊 Yaxshi', '🤩 Ajoyib!'][rating]}
              </Text>
            )}
          </View>

          {/* Message */}
          <View style={[s.card, { backgroundColor: theme.card }]}>
            <Text style={[s.sectionLabel, { color: theme.textSub }]}>{t.feedbackTitle || 'Fikr'}</Text>
            <TextInput
              style={[s.textarea, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder, color: theme.text }]}
              placeholder={t.feedbackPlaceholder || 'Fikringizni yozing...'}
              placeholderTextColor={theme.textSub}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
              maxLength={500}
              textAlignVertical="top"
            />
            <Text style={[s.charCount, { color: theme.textSub }]}>{message.length}/500</Text>
          </View>

          {/* Submit */}
          <TouchableOpacity style={[s.submitBtn, { backgroundColor: '#4fc3f7' }]} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnText}>{t.feedbackSend || 'Yuborish'}</Text>}
          </TouchableOpacity>

          {afterCall && (
            <TouchableOpacity style={s.skipBtn} onPress={handleDone}>
              <Text style={[s.skipBtnText, { color: theme.textSub }]}>O'tkazib yuborish →</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 24 },
  backBtn: { marginBottom: 12 },
  backBtnText: { fontSize: 22 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 6 },
  sub: { fontSize: 14 },
  card: { borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sectionLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  starsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  starBtn: { padding: 4 },
  star: { fontSize: 40 },
  ratingLabel: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  textarea: { borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 100, maxHeight: 160 },
  charCount: { fontSize: 11, textAlign: 'right', marginTop: 6 },
  submitBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  skipBtn: { alignItems: 'center', marginTop: 16, paddingVertical: 8 },
  skipBtnText: { fontSize: 14 },
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 16 },
  successIcon: { fontSize: 72 },
  successTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  successSub: { fontSize: 15, textAlign: 'center' },
  doneBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 48, marginTop: 8 },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
