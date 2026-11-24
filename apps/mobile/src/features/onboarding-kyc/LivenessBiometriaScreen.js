// PROTÓTIPO: esta tela NÃO captura selfie nem verifica identidade. O botão só troca o estado local;
// nenhuma imagem é enviada a lugar algum. O produto real é apps/web. Veja services/api/README.md.
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
        <Text>Protótipo: nenhuma verificação foi feita e nenhuma foto foi capturada.</Text>
      )}
    </View>
  );
}
