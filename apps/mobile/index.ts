import { registerRootComponent } from 'expo';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import App from './App';
function Root(){
 const [loaded,error]=useFonts({Inter_400Regular,Inter_500Medium,Inter_600SemiBold,Inter_700Bold});
 if(!loaded&&!error)return React.createElement(View,{style:{flex:1,justifyContent:'center',backgroundColor:'#f5f5f7'}},React.createElement(ActivityIndicator,{color:'#7000ff'}));
 return React.createElement(App);
}
registerRootComponent(Root);
