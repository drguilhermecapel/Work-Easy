import React from 'react';
import { features } from '../../config/features';
import { Notice } from './ui';
import { nothingRead, type PlatformFacts } from './usePlatformFacts';

/** Says why a page prints no number: the demo has no real values, or the platform could not be read. */
const FactsNote: React.FC<{ facts: PlatformFacts; loading: boolean }> = ({ facts, loading }) => {
  if (!features.backendEnabled) {
    return <Notice>Nesta demonstração não há valores reais. Eles aparecem aqui quando o WorkEasy está conectado ao servidor.</Notice>;
  }
  if (!loading && nothingRead(facts)) {
    return <Notice>Não foi possível ler esses valores agora. Tente de novo mais tarde.</Notice>;
  }
  return null;
};

export default FactsNote;
