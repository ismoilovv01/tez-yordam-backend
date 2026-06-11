import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Platform, StatusBar as RNStatusBar } from 'react-native';

import RoleScreen from './screens/RoleScreen';
import LoginScreen from './screens/LoginScreen';
import DriverLoginScreen from './screens/DriverLoginScreen';
import CallerHomeScreen from './screens/caller/HomeScreen';
import CallerEmergencyScreen from './screens/caller/EmergencyScreen';
import CallerConfirmationScreen from './screens/caller/ConfirmationScreen';
import CallerProfileScreen from './screens/caller/ProfileScreen';
import CallerNotificationsScreen from './screens/caller/NotificationsScreen';
import EmergencyNumbersScreen from './screens/caller/EmergencyNumbersScreen';
import DriverHomeScreen from './screens/driver/HomeScreen';
import PoliceHomeScreen from './screens/driver/PoliceHomeScreen';
import FireHomeScreen from './screens/driver/FireHomeScreen';
import DriverHistoryScreen from './screens/driver/CallHistoryScreen';
import LocationTracker from './components/LocationTracker';
import SoundNotification from './components/SoundNotification';
import { LanguageProvider } from './LanguageContext';

const Stack = createNativeStackNavigator();

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [role, setRole] = useState(null);
  const [serviceType, setServiceType] = useState('ambulance');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const restore = async () => {
      try {
        const savedToken = await AsyncStorage.getItem('app_token');
        const savedUser = await AsyncStorage.getItem('app_user');
        const savedServiceType = await AsyncStorage.getItem('app_service_type');
        if (savedToken && savedUser) {
          const userData = JSON.parse(savedUser);
          setToken(savedToken);
          setUser(userData);
          setRole(userData.user_type === 'driver' ? 'driver' : 'caller');
          setServiceType(savedServiceType || 'ambulance');
        }
      } catch {}
      setReady(true);
    };
    restore();
  }, []);

  const handleLogin = async (userData, authToken) => {
    await AsyncStorage.setItem('app_token', authToken);
    await AsyncStorage.setItem('app_user', JSON.stringify(userData));
    setToken(authToken);
    setUser(userData);
    setRole(userData.user_type === 'driver' ? 'driver' : 'caller');
  };

  const handleDriverLogin = async (authToken, userData, svcType) => {
    await AsyncStorage.setItem('app_token', authToken);
    await AsyncStorage.setItem('app_user', JSON.stringify(userData));
    await AsyncStorage.setItem('app_service_type', svcType || 'ambulance');
    setToken(authToken);
    setUser(userData);
    setRole('driver');
    setServiceType(svcType || 'ambulance');
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('app_token');
    await AsyncStorage.removeItem('app_user');
    await AsyncStorage.removeItem('app_service_type');
    setToken(null);
    setUser(null);
    setRole(null);
    setServiceType('ambulance');
  };

  if (!ready) return null;

  const isDriver = role === 'driver';

  if (Platform.OS === 'android') {
    RNStatusBar.setTranslucent(true);
    RNStatusBar.setBackgroundColor('transparent');
  }

  const DriverScreen = serviceType === 'police' ? PoliceHomeScreen
    : serviceType === 'fire' ? FireHomeScreen
    : DriverHomeScreen;

  return (
    <LanguageProvider>
      <>
        <StatusBar style="light" />
        {token && isDriver && <LocationTracker token={token} />}
        {token && isDriver && <SoundNotification token={token} />}

        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            {!token ? (
              <>
                <Stack.Screen name="Role">
                  {(props) => (
                    <RoleScreen {...props}
                      onSelectRole={(selectedRole) => {
                        if (selectedRole === 'hodim') {
                          props.navigation.navigate('HodimLogin');
                        } else {
                          props.navigation.navigate('Login', { role: selectedRole });
                        }
                      }}
                    />
                  )}
                </Stack.Screen>
                <Stack.Screen name="Login">
                  {(props) => (
                    <LoginScreen {...props}
                      role={props.route?.params?.role}
                      onLogin={handleLogin}
                    />
                  )}
                </Stack.Screen>
                <Stack.Screen name="HodimLogin">
                  {(props) => (
                    <DriverLoginScreen {...props} onLogin={handleDriverLogin} />
                  )}
                </Stack.Screen>
              </>
            ) : isDriver ? (
              <>
                <Stack.Screen name="DriverHome">
                  {(props) => (
                    <DriverScreen {...props} token={token} user={user} onLogout={handleLogout} />
                  )}
                </Stack.Screen>
                <Stack.Screen name="DriverHistory">
                  {(props) => <DriverHistoryScreen {...props} token={token} />}
                </Stack.Screen>
                <Stack.Screen name="CallerProfile">
                  {(props) => (
                    <CallerProfileScreen {...props}
                      user={user} token={token} onLogout={handleLogout}
                      homeScreen="DriverHome"
                    />
                  )}
                </Stack.Screen>
                <Stack.Screen name="CallerNotifications">
                  {(props) => <CallerNotificationsScreen {...props} token={token} />}
                </Stack.Screen>
                <Stack.Screen name="CallerEmergencyNumbers">
                  {(props) => <EmergencyNumbersScreen {...props} />}
                </Stack.Screen>
              </>
            ) : (
              <>
                <Stack.Screen name="CallerHome">
                  {(props) => (
                    <CallerHomeScreen {...props} user={user} token={token} />
                  )}
                </Stack.Screen>
                <Stack.Screen name="CallerEmergency">
                  {(props) => <CallerEmergencyScreen {...props} token={token} />}
                </Stack.Screen>
                <Stack.Screen name="CallerConfirmation">
                  {(props) => (
                    <CallerConfirmationScreen {...props} token={token} onLogout={handleLogout} />
                  )}
                </Stack.Screen>
                <Stack.Screen name="CallerProfile">
                  {(props) => (
                    <CallerProfileScreen {...props}
                      user={user} token={token} onLogout={handleLogout}
                      homeScreen="CallerHome"
                    />
                  )}
                </Stack.Screen>
                <Stack.Screen name="CallerNotifications">
                  {(props) => <CallerNotificationsScreen {...props} token={token} />}
                </Stack.Screen>
                <Stack.Screen name="CallerEmergencyNumbers">
                  {(props) => <EmergencyNumbersScreen {...props} />}
                </Stack.Screen>
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </>
    </LanguageProvider>
  );
}
