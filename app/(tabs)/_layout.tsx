// ============================================================
// app/(tabs)/_layout.tsx
// Tab navigator with 4 tabs: Home, Transactions, Budget, Settings
// ============================================================

import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabConfig {
  name: string;
  title: string;
  activeIcon: IoniconName;
  inactiveIcon: IoniconName;
}

const TAB_CONFIG: TabConfig[] = [
  {
    name: 'index',
    title: 'Home',
    activeIcon: 'home',
    inactiveIcon: 'home-outline',
  },
  {
    name: 'transactions',
    title: 'Transactions',
    activeIcon: 'list',
    inactiveIcon: 'list-outline',
  },
  {
    name: 'budget',
    title: 'Budget',
    activeIcon: 'pie-chart',
    inactiveIcon: 'pie-chart-outline',
  },
  {
    name: 'settings',
    title: 'Settings',
    activeIcon: 'settings',
    inactiveIcon: 'settings-outline',
  },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#e5e7eb',
          borderTopWidth: 1,
          paddingBottom: Platform.OS === 'ios' ? 0 : 4,
          height: Platform.OS === 'ios' ? 84 : 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginBottom: Platform.OS === 'ios' ? 0 : 2,
        },
      }}
    >
      {TAB_CONFIG.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? tab.activeIcon : tab.inactiveIcon}
                size={24}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
