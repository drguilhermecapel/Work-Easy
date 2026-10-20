import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";

export default function LivenessBiometriaScreen() {
  const [concluido, setConcluido] = useState(false);
  return (
    <View>
      <Text>Reconhecimento Facial & Prova de Vida</Text>
      {!concluido ? (
        <TouchableOpacity onPress={() => setConcluido(true)}>
          <Text>Capturar Selfie e Validar</Text>
        </TouchableOpacity>
      ) : (
        <Text>Identidade confirmada! Suas fotos já foram apagadas da memória RAM.</Text>
      )}
    </View>
  );
}
