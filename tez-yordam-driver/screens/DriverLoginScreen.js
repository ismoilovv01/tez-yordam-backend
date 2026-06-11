import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL } from '../constants';
import { useLanguage } from '../LanguageContext';

export default function DriverLoginScreen({ onLogin, navigation }) {
  const { t, theme } = useLanguage();
  const [phone, setPhone] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 9) return setError(t.driverPhoneError);
    if (loginCode.length < 6) return setError(t.driverCodeError);
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/driver-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+998' + cleanPhone, login_code: loginCode.toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.error);
      onLogin(data.token, data.user, data.service_type);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      {/* Red hero section */}
      <View style={s.hero}>
        <View style={s.circle1} />
        <View style={s.circle2} />
        <View style={s.circle3} />
        <Text style={s.heroIcon}>👮</Text>
        <Text style={s.heroTitle}>{t.driverLoginTitle}</Text>
        <Text style={s.heroSub}>{t.driverLoginSubtitle}</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          style={[s.card, { backgroundColor: theme.card }]}
          contentContainerStyle={s.cardContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[s.formTitle, { color: theme.text }]}>{t.driverLoginFormTitle}</Text>
          <Text style={[s.formSub, { color: theme.textSub }]}>{t.driverLoginFormSub}</Text>

          {/* Phone */}
          <Text style={[s.label, { color: theme.text }]}>{t.driverPhoneLabel}</Text>
          <View style={[s.inputRow, { backgroundColor: '#fff', borderColor: '#ddd' }]}>
            <View style={s.prefix}><Text style={s.prefixText}>+998</Text></View>
            <TextInput
              style={[s.input, { color: '#000', backgroundColor: '#fff' }]}
              placeholder="90 123 45 67"
              placeholderTextColor="#aaa"
              value={phone}
              onChangeText={(v) => setPhone(v.replace(/\D/g, ''))}
              keyboardType="phone-pad"
              maxLength={9}
            />
          </View>

          {/* Login code */}
          <Text style={[s.label, { color: theme.text, marginTop: 16 }]}>{t.driverCodeLabel}</Text>
          <Text style={[s.hint, { color: theme.textSub }]}>{t.driverCodeHint}</Text>
          <TextInput
            style={[s.codeInput, { backgroundColor: '#fff', borderColor: '#ddd', color: '#000' }]}
            placeholder="XXXXXXXX"
            placeholderTextColor="#aaa"
            value={loginCode}
            onChangeText={(v) => setLoginCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            autoCapitalize="characters"
            maxLength={8}
          />

          {!!error && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>⚠️ {error}</Text>
            </View>
          )}

          <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{t.driverLoginBtn}</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={[s.backBtnText, { color: theme.textSub }]}>{t.back}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#e74c3c' },
  hero: { alignItems: 'center', paddingVertical: 40, backgroundColor: '#e74c3c', position: 'relative', overflow: 'hidden' },
  circle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', top: '50%', left: '50%', marginLeft: -100, marginTop: -100 },
  circle2: { position: 'absolute', width: 280, height: 280, borderRadius: 140, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', top: '50%', left: '50%', marginLeft: -140, marginTop: -140 },
  circle3: { position: 'absolute', width: 360, height: 360, borderRadius: 180, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', top: '50%', left: '50%', marginLeft: -180, marginTop: -180 },
  heroIcon: { fontSize: 64, marginBottom: 8, zIndex: 1 },
  heroTitle: { fontSize: 28, fontWeight: '700', color: '#fff', zIndex: 1 },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', letterSpacing: 2, marginTop: 4, zIndex: 1 },
  card: { flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -20 },
  cardContent: { padding: 24, paddingBottom: 40 },
  formTitle: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  formSub: { fontSize: 13, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  hint: { fontSize: 11, marginBottom: 8, marginTop: -4 },
  inputRow: { flexDirection: 'row', borderRadius: 12, borderWidth: 1.5, overflow: 'hidden' },
  prefix: { backgroundColor: '#f9f9f9', paddingHorizontal: 14, justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#ddd' },
  prefixText: { fontSize: 15, color: '#555', fontWeight: '600' },
  input: { flex: 1, padding: 14, fontSize: 15 },
  codeInput: { borderRadius: 12, borderWidth: 1.5, padding: 14, fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: 6, marginTop: 4 },
  errorBox: { backgroundColor: '#fff5f5', borderRadius: 10, padding: 10, marginTop: 10, borderWidth: 1, borderColor: '#ffcdd2' },
  errorText: { color: '#e74c3c', fontSize: 13 },
  btn: { backgroundColor: '#e74c3c', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  backBtn: { alignItems: 'center', marginTop: 16 },
  backBtnText: { fontSize: 14 },
});
