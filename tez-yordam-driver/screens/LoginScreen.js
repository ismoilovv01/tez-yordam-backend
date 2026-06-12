import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, Animated,
} from 'react-native';
import { API_URL } from '../constants';
import { useLanguage } from '../LanguageContext';

const RESEND_SECONDS = 60;

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
  const [secondsLeft, setSecondsLeft] = useState(0);

  const timerRef = useRef(null);

  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const pulse3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makePulse = (anim, delay) => {
      anim.setValue(0);
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 2000, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    };
    const a1 = makePulse(pulse1, 0);
    const a2 = makePulse(pulse2, 650);
    const a3 = makePulse(pulse3, 1300);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [secondsLeft > 0]);

  const ringStyle = (anim) => ({
    opacity: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 0.2, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }],
  });

  const sendCode = async () => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 9) return setError(t.loginSub || "To'liq raqam kiriting");
    setLoading(true); setError('');
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
      setCode('');
      setSecondsLeft(RESEND_SECONDS);
    } catch (err) {
      setError(err.message || 'Xato');
    }
    setLoading(false);
  };

  const handleVerifyCode = async (fn, ln) => {
    if (!code || code.length < 6) return setError(t.enterCode || '6 xonali kod kiriting');
    if (secondsLeft <= 0) return setError(t.codeExpired || 'Kod muddati tugadi, qaytadan yuboring');
    setLoading(true); setError('');
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
          <Animated.View style={[s.pulseRing, ringStyle(pulse1)]} />
          <Animated.View style={[s.pulseRing, ringStyle(pulse2)]} />
          <Animated.View style={[s.pulseRing, ringStyle(pulse3)]} />
          <Text style={s.heroIcon}>🚑</Text>
          <Text style={s.heroTitle}>Help Mee</Text>
        </View>

        <ScrollView style={[s.card, { backgroundColor: theme.card }]} contentContainerStyle={s.cardContent} keyboardShouldPersistTaps="handled">

          {step === 'phone' && (
            <>
              <Text style={[s.formTitle, { color: theme.text }]}>{t.loginTitle || 'Kirish'}</Text>
              <Text style={[s.formSub, { color: theme.textSub }]}>{t.loginSub || 'Telefon raqamingizni kiriting'}</Text>
              <View style={[s.inputRow, { borderColor: '#ddd' }]}>
                <View style={s.prefix}>
                  <Text style={s.prefixText}>+998</Text>
                </View>
                <TextInput
                  style={[s.input, { color: theme.text }]}
                  placeholder="90 123 45 67" placeholderTextColor="#aaa"
                  keyboardType="phone-pad" value={phone}
                  onChangeText={(v) => { setPhone(v.replace(/\D/g, '')); setError(''); }}
                  maxLength={9}
                />
              </View>
              {!!error && <Text style={s.error}>⚠️ {error}</Text>}
              <TouchableOpacity style={s.btn} onPress={sendCode} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{t.sendCode || 'Kod yuborish'}</Text>}
              </TouchableOpacity>
            </>
          )}

          {step === 'code' && (
            <>
              <Text style={[s.formTitle, { color: theme.text }]}>{t.enterCode || 'Kodni kiriting'}</Text>
              <Text style={[s.formSub, { color: theme.textSub }]}>+998{phone} {t.codeSentTo || 'raqamiga kod yuborildi'}</Text>
              <TextInput
                style={[s.codeInput, { color: theme.text, borderColor: '#ddd' }]}
                placeholder="------" placeholderTextColor="#aaa"
                keyboardType="number-pad" value={code}
                onChangeText={(v) => { setCode(v.replace(/\D/g, '')); setError(''); }}
                maxLength={6}
              />
              {!!error && <Text style={s.error}>⚠️ {error}</Text>}
              <TouchableOpacity style={s.btn} onPress={() => handleVerifyCode()} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{t.continue || 'Davom etish'}</Text>}
              </TouchableOpacity>

              {secondsLeft > 0 ? (
                <Text style={s.timerText}>
                  {(t.resendIn || 'Qaytadan yuborish')} 0:{secondsLeft < 10 ? `0${secondsLeft}` : secondsLeft}
                </Text>
              ) : (
                <TouchableOpacity style={s.btnResend} onPress={sendCode} disabled={loading}>
                  <Text style={s.btnResendText}>{t.resendCode || "Qayta yuborish"}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={s.btnBack} onPress={() => { setStep('phone'); setCode(''); setError(''); setSecondsLeft(0); }}>
                <Text style={s.btnBackText}>{t.back || 'Orqaga'}</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'profile' && (
            <>
              <Text style={[s.formTitle, { color: theme.text }]}>{t.fillProfile || "Profilni to'ldiring"}</Text>
              <Text style={[s.formSub, { color: theme.textSub }]}>{t.fillProfileSub || 'Ism va familiyangizni kiriting'}</Text>
              <View style={[s.inputRow, { borderColor: '#ddd' }]}>
                <TextInput style={[s.input, { color: theme.text }]} placeholder={t.firstName || 'Ism'} placeholderTextColor="#aaa" value={firstName} onChangeText={setFirstName} />
              </View>
              <View style={[s.inputRow, { borderColor: '#ddd' }]}>
                <TextInput style={[s.input, { color: theme.text }]} placeholder={t.lastName || 'Familiya'} placeholderTextColor="#aaa" value={lastName} onChangeText={setLastName} />
              </View>
              {!!error && <Text style={s.error}>⚠️ {error}</Text>}
              <TouchableOpacity style={s.btn} onPress={handleProfileSubmit} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>✅ {t.register || "Ro'yxatdan o'tish"}</Text>}
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
  pulseRing: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  heroIcon: { fontSize: 64, zIndex: 1, marginBottom: 12 },
  heroTitle: { fontSize: 32, fontWeight: '800', color: '#fff', zIndex: 1, letterSpacing: 1 },
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
  timerText: { textAlign: 'center', color: '#888', fontSize: 13, marginBottom: 10 },
  btnResend: { width: '100%', padding: 12, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  btnResendText: { color: '#e74c3c', fontSize: 14, fontWeight: '700' },
});
