import { GoogleGenAI } from "@google/genai";

// Initialize Gemini
// Note: In a real app, ensure process.env.API_KEY is defined in your build environment
const apiKey = process.env.API_KEY || 'dummy_key_for_demo'; 
const ai = new GoogleGenAI({ apiKey });

/**
 * Generates a helpful description for a service request based on a few keywords.
 */
export const generateServiceDescription = async (keywords: string): Promise<string> => {
  if (apiKey === 'dummy_key_for_demo') {
    return `Descrição sugerida (Simulação AI): Preciso de um serviço profissional para ${keywords}. Por favor, traga seus equipamentos e entre em contato para definirmos os detalhes.`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are an assistant for a service marketplace app. 
      Write a concise, polite, and clear service request description (in Portuguese) based on these keywords: "${keywords}".
      The description should be written from the perspective of a client hiring a professional.
      Keep it under 50 words. Focus on being direct about the need.`,
      config: {
        temperature: 0.7,
        maxOutputTokens: 100,
      }
    });
    return response.text || "Não foi possível gerar a descrição.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Erro ao gerar sugestão. Por favor, escreva manualmente.";
  }
};