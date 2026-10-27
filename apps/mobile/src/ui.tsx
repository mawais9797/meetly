import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { Status, asciiDigits, isPhoneInput, normalizePhone, PHONE_HINT } from '@appointments/core';
import { fonts, gradients, palette, radius, shadow, space, statusColors } from './theme';
export { palette } from './theme';

export function Button({title,onPress,kind='primary',disabled=false}:{title:string;onPress:()=>void;kind?:'primary'|'secondary'|'danger';disabled?:boolean}) {
 return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
  style={({pressed})=>[s.button,kind==='primary'?s.primary:kind==='danger'?s.danger:s.secondary,pressed&&s.pressed,disabled&&s.disabled]}>
  <Text style={[s.buttonText,kind!=='secondary'&&{color:palette.white}]}>{title}</Text>
 </Pressable>;
}
export function Field({label,style,onFocus,onBlur,error,...props}:TextInputProps&{label:string;error?:string}) {
 const [focused,setFocused]=useState(false);
 return <View style={s.field}><Text style={s.label}>{label}</Text>
  <TextInput {...props} accessibilityLabel={label} placeholderTextColor={palette.muted}
   selectionColor={palette.primary} onFocus={event=>{setFocused(true);onFocus?.(event);}}
   onBlur={event=>{setFocused(false);onBlur?.(event);}}
   style={[s.input,props.multiline&&s.multiline,focused&&s.inputFocused,error&&{borderColor:'#b4233a'},style]}/>
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
 </View>;
}
export function PhoneField({value,onChangeText}:{value:string;onChangeText:(value:string)=>void}) {
 const [error,setError]=useState(''),[touched,setTouched]=useState(false);
 return <><Field label="Phone number" value={value} keyboardType="phone-pad" autoComplete="tel" maxLength={32}
  placeholder="+923001234567" error={error}
  onChangeText={input=>{const next=asciiDigits(input);if(!isPhoneInput(next)){setError('Phone numbers cannot contain letters.');return;}onChangeText(next);setError(touched&&!normalizePhone(next)?PHONE_HINT:'');}}
  onBlur={()=>{setTouched(true);setError(normalizePhone(value)?'':PHONE_HINT);}}/><Muted>{PHONE_HINT} Local, +92 and 0092 formats are accepted.</Muted></>;
}
export function Card({children}:{children:React.ReactNode}){return <View style={s.card}>{children}</View>;}
export function Title({children}:{children:React.ReactNode}){return <Text accessibilityRole="header" style={s.title}>{children}</Text>;}
export function Muted({children}:{children:React.ReactNode}){return <Text style={s.muted}>{children}</Text>;}
export function Badge({status}:{status:Status}){return <View style={[s.badge,{backgroundColor:statusColors[status]+'12'}]}><Text style={[s.badgeText,{color:statusColors[status]}]}>● {status}</Text></View>;}
export function Chips({items,value,onChange}:{items:string[];value:string;onChange:(v:string)=>void}){return <View style={s.chips}>{items.map(item=><Pressable accessibilityRole="button" accessibilityState={{selected:value===item}} onPress={()=>onChange(item)} key={item} style={({pressed})=>[s.chip,value===item&&s.selectedChip,pressed&&s.pressed]}><Text style={[s.chipText,value===item&&{color:palette.primary}]}>{item}</Text></Pressable>)}</View>;}

export const s=StyleSheet.create({
 container:{flex:1,backgroundColor:palette.bg},
 content:{padding:space.large,paddingBottom:40,gap:space.medium},
 header:{paddingHorizontal:space.large,paddingVertical:space.large,backgroundColor:palette.primary,backgroundImage:gradients.action,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:space.small},
 brand:{fontFamily:fonts.bold,fontSize:30,color:palette.primary,letterSpacing:-1},
 headerBrand:{fontFamily:fonts.bold,fontSize:30,color:palette.white,letterSpacing:-1},
 headerCaption:{fontFamily:fonts.medium,fontSize:10,color:palette.white,letterSpacing:1.1,marginTop:space.micro},
 headerAction:{minHeight:44,padding:12,borderRadius:radius.control,backgroundColor:'#ffffff18',borderWidth:1,borderColor:'#ffffff38',alignItems:'center',justifyContent:'center'},
 headerActionText:{fontFamily:fonts.semibold,fontSize:12,color:palette.white},
 small:{fontFamily:fonts.regular,fontSize:12,color:palette.muted,lineHeight:18},
 title:{fontFamily:fonts.bold,fontSize:26,color:palette.ink,letterSpacing:-.6,marginBottom:space.small,lineHeight:34},
 subtitle:{fontFamily:fonts.semibold,fontSize:18,color:palette.primary,marginBottom:space.small,lineHeight:26},
 muted:{fontFamily:fonts.regular,fontSize:14,color:palette.muted,lineHeight:22,marginBottom:space.small},
 body:{fontFamily:fonts.regular,fontSize:15,color:palette.ink,lineHeight:24},
 card:{backgroundColor:palette.white,borderWidth:1,borderColor:'#ececf1',borderRadius:radius.card,padding:space.large,gap:space.small,...shadow},
 button:{minHeight:48,paddingVertical:14,paddingHorizontal:20,borderRadius:radius.control,alignItems:'center',justifyContent:'center',marginTop:space.micro,flexShrink:1},
 primary:{backgroundColor:palette.primary,backgroundImage:gradients.action,...shadow,shadowColor:palette.primary,shadowOpacity:.16},
 secondary:{borderWidth:1,borderColor:palette.border,backgroundColor:palette.white},
 danger:{backgroundColor:palette.danger},
 buttonText:{fontFamily:fonts.semibold,fontSize:14,lineHeight:20,color:palette.primary,textAlign:'center'},
 pressed:{opacity:.82},disabled:{opacity:.45,elevation:0,shadowOpacity:0},
 field:{marginVertical:space.small,gap:space.small},
 label:{fontFamily:fonts.medium,fontSize:13,color:palette.muted},
 input:{borderWidth:1,borderColor:palette.border,borderRadius:radius.control,padding:14,fontFamily:fonts.regular,fontSize:16,color:palette.ink,backgroundColor:palette.input,minHeight:48},
 inputFocused:{borderColor:palette.primary,backgroundColor:palette.white},
 multiline:{height:144,textAlignVertical:'top'},
 badge:{alignSelf:'flex-start',paddingHorizontal:10,paddingVertical:6,borderRadius:8},
 badgeText:{fontFamily:fonts.medium,fontSize:12,lineHeight:18},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:space.small,marginVertical:space.small},
 chip:{borderWidth:1,borderColor:palette.border,borderRadius:radius.control,paddingVertical:12,paddingHorizontal:16,minHeight:44,backgroundColor:palette.white,justifyContent:'center'},
 selectedChip:{backgroundColor:palette.primarySoft,borderColor:'#dbc2fa'},
 chipText:{fontFamily:fonts.medium,fontSize:13,color:palette.muted},
 row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:space.small},
 divider:{height:1,backgroundColor:palette.border,marginVertical:space.medium},
 error:{padding:space.medium,backgroundColor:'#fff0f2',color:'#aa2942',fontFamily:fonts.regular,fontSize:14,lineHeight:22,borderRadius:radius.control},
 success:{padding:space.medium,backgroundColor:'#e1f8f4',color:palette.accentInk,fontFamily:fonts.regular,fontSize:14,lineHeight:22,borderRadius:radius.control},
 tabs:{paddingHorizontal:space.medium,paddingVertical:12,backgroundColor:palette.white,borderTopWidth:1,borderColor:palette.border},
 tab:{paddingHorizontal:space.medium,paddingVertical:12,borderRadius:radius.control,minHeight:44,justifyContent:'center'},
 tabText:{fontFamily:fonts.semibold,fontSize:13,color:palette.muted},
 statRow:{flexDirection:'row',flexWrap:'wrap',gap:12},
 stat:{padding:space.medium,borderRadius:radius.card,backgroundColor:palette.white,borderWidth:1,borderColor:palette.border,width:'47%',...shadow},
 statNumber:{fontFamily:fonts.bold,fontSize:32,color:palette.primary,marginTop:space.small,letterSpacing:-1},
 calendarCell:{width:'14.28%',padding:space.micro,minHeight:72,borderWidth:.5,borderColor:palette.border},
 dayNumber:{fontFamily:fonts.medium,color:palette.ink,fontSize:13,textAlign:'center',padding:space.micro},
 eventDot:{fontFamily:fonts.medium,fontSize:9,color:palette.primary,textAlign:'center'},
 bar:{height:12,backgroundColor:palette.lavender,backgroundImage:gradients.brand,borderRadius:6},
});
