import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView,
} from 'react-native';
import { API_URL } from '../constants';
import { useLanguage } from '../LanguageContext';

export default function LoginScreen({ onLogin, route }) {
  const { t, theme } = useLanguage();
  const role = route?.params?.role;
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendCode = async () => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 9) return setError("To'liq raqam kiriting");
    setLoading(true);
    setError('');
    try {
      const fullPhone = '+998' + clean;
      const res = await fetch(`${API_URL}/api/auth/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Xato');
      setStep('code');
    } catch (err) {
      setError(err.message || 'Xato');
    }
    setLoading(false);
  };

  const handleVerifyCode = async (fn, ln) => {
    if (!code || code.length < 6) return setError('6 xonali kod kiriting');
    setLoading(true);
    setError('');
    try {
      const clean = phone.replace(/\D/g, '');
      const fullPhone = '+998' + clean;
      const body = { phone: fullPhone, code, role: role || 'caller' };
      if (fn && ln) { body.first_name = fn; body.last_name = ln; }
      const res = await fetch(`${API_URL}/api/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Xato');
      if (data.requires_profile) { setStep('profile'); setLoading(false); return; }
      onLogin(data.user, data.token);
    } catch (err) {
      setError(err.message || 'Xato');
    }
    setLoading(false);
  };

  const handleProfileSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) return setError("Ism va familiya kiriting");
    await handleVerifyCode(firstName.trim(), lastName.trim());
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: '#c0392b' }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.hero}>
          <View style={s.pulseRing} />
          <View style={[s.pulseRing, s.pulseDelay1]} />
          <View style={[s.pulseRing, s.pulseDelay2]} />
          <Text style={s.heroTitle}>Tez Yordam</Text>
          <Text style={s.heroTagline}>FAVQULODDA TIBBIY YORDAM</Text>
        </View>
        <ScrollView style={[s.card, { backgroundColor: theme.card }]} contentContainerStyle={s.cardContent} keyboardShouldPersistTaps="handled">
          {step === 'phone' && (
            <>
              <Text style={[s.formTitle, { color: theme.text }]}>Kirish</Text>
              <Text style={[s.formSub, { color: theme.textSub }]}>Telefon raqamingizni kiriting</Text>
              <View style={[s.inputRow, { borderColor: '#ddd' }]}>
                <View style={s.prefix}><Text style={s.prefixText}>+998</Text></View>
                <TextInput style={[s.input, { color: theme.text }]} placeholder="90 123 45 67" placeholderTextColor="#aaa" keyboardType="phone-pad" value={phone} onChangeText={(v) => { setPhone(v.replace(/\D/g, '')); setError(''); }} maxLength={9} />
              </View>
              {!!error && <Text style={s.error}>{error}</Text>}
              <TouchableOpacity style={s.btn} onPress={handleSendCode} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Kod yuborish</Text>}
              </TouchableOpacity>
            </>
          )}
          {step === 'code' && (
            <>
              <Text style={[s.formTitle, { color: theme.text }]}>Kodni kiriting</Text>
              <Text style={[s.formSub, { color: theme.textSub }]}>+998{phone} raqamiga kod yuborildi</Text>
              <TextInput style={[s.codeInput, { color: theme.text, borderColor: '#ddd' }]} placeholder="------" placeholderTextColor="#aaa" keyboardType="number-pad" value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '')); setError(''); }} maxLength={6} />
              {!!error && <Text style={s.error}>{error}</Text>}
              <TouchableOpacity style={s.btn} onPress={() => handleVerifyCode()} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Davom etish</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={s.btnBack} onPress={() => { setStep('phone'); setCode(''); setError(''); }}>
                <Text style={s.btnBackText}>Orqaga</Text>
              </TouchableOpacity>
            </>
          )}
          {step === 'profile' && (
            <>
              <Text style={[s.formTitle, { color: theme.text }]}>Profilni to'ldiring</Text>
              <Text style={[s.formSub, { color: theme.textSub }]}>Ism va familiyangizni kiriting</Text>
              <View style={[s.inputRow, { borderColor: '#ddd' }]}><TextInput style={[s.input, { color: theme.text }]} placeholder="Ism" placeholderTextColor="#aaa" value={firstName} onChangeText={setFirstName} /></View>
              <View style={[s.inputRow, { borderColor: '#ddd' }]}><TextInput style={[s.input, { color: theme.text }]} placeholder="Familiya" placeholderTextColor="#aaa" value={lastName} onChangeText={setLastName} /></View>
              {!!error && <Text style={s.error}>{error}</Text>}
              <TouchableOpacity style={s.btn} onPress={handleProfileSubmit} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Royxatdan otish</Text>}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e74c3c', position: 'relative', minHeight: 220 },
  pulseRing: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  pulseDelay1: { width: 200, height: 200, borderRadius: 100 },
  pulseDelay2: { width: 240, height: 240, borderRadius: 120 },
  heroTitle: { fontSize: 32, fontWeight: '800', color: '#fff', zIndex: 1, letterSpacing: 1 },
  heroTagline: { fontSize: 13, color: 'rgba(255,255,255,0.8)', zIndex: 1, marginTop: 6, letterSpacing: 2 },
  card: { borderTopLeftRadius: 28, borderTopRightRadius: 28, flexShrink: 0 },
  cardContent: { padding: 28, paddingBottom: 40 },
  formTitle: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  formSub: { fontSize: 13, color: '#888', marginBottom: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 10, overflow: 'hidden', marginBottom: 14 },
  prefix: { paddingHorizontal: 12, height: 50, justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#ddd', backgroundColor: '#f9f9f9' },
  prefixText: { fontSize: 15, color: '#555', fontWeight: '600' },
  input: { flex: 1, paddingHorizontal: 12, paddingVertical: 14, fontSize: 16 },
  codeInput: { borderWidth: 1.5, borderRadius: 10, textAlign: 'center', fontSize: 24, letterSpacing: 8, padding: 14, marginBottom: 14 },
  error: { color: '#e74c3c', fontSize: 12, marginBottom: 10 },
  btn: { width: '100%', padding: 15, borderRadius: 12, alignItems: 'center', backgroundColor: '#e74c3c', marginBottom: 10 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnBack: { width: '100%', padding: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#ddd' },
  btnBackText: { color: '#888', fontSize: 14 },
});