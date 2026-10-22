import { Provider, RequestStatus, ServiceRequest, MedicalRecord } from './types';

// Demo data only. The service catalog (areas, occupations and their
// policies) lives in catalog/.

export const MOCK_PROVIDERS: Provider[] = [
  {
    id: '1',
    name: 'João Santos',
    title: 'Pintor Profissional',
    rating: 4.8,
    totalReviews: 124,
    verified: true,
    distance: 2.5,
    location: 'Centro, São Paulo',
    description: 'Especialista em pintura residencial e comercial com 10 anos de experiência. Trabalho limpo e organizado.',
    yearsExperience: 10,
    services: [
      { id: 's1', title: 'Pintura Interna', category: 'reformas', description: 'Pintura de paredes e tetos', priceMin: 15, priceMax: 25, unit: 'm2' },
      { id: 's2', title: 'Textura', category: 'reformas', description: 'Aplicação de texturas diversas', priceMin: 30, priceMax: 50, unit: 'm2' }
    ],
    reviews: [
      { id: 'r1', clientName: 'Maria Silva', rating: 5, comment: 'Excelente trabalho! Muito caprichoso.', date: '2023-10-15', tags: ['Pontual', 'Limpo'] },
      { id: 'r2', clientName: 'Roberto Costa', rating: 4, comment: 'Bom profissional, recomendo.', date: '2023-09-20', tags: ['Rápido'] }
    ]
  },
  {
    id: '2',
    name: 'Ana Oliveira',
    title: 'Diarista e Limpeza Pesada',
    rating: 4.9,
    totalReviews: 89,
    verified: true,
    distance: 1.2,
    location: 'Vila Mariana, São Paulo',
    description: 'Limpeza detalhada e cuidadosa. Levo meus próprios produtos se necessário.',
    yearsExperience: 5,
    services: [
      { id: 's3', title: 'Faxina Completa', category: 'limpeza', description: 'Limpeza geral de apartamento até 80m2', priceMin: 180, priceMax: 220, unit: 'dia' }
    ],
    reviews: [
      { id: 'r3', clientName: 'Carla Dias', rating: 5, comment: 'A melhor diarista que já contratei.', date: '2023-11-01', tags: ['Confiança', 'Detalhe'] }
    ]
  },
  {
    id: '3',
    name: 'Carlos Mendes',
    title: 'Eletricista Residencial',
    rating: 4.5,
    totalReviews: 45,
    verified: false,
    distance: 5.0,
    location: 'Pinheiros, São Paulo',
    description: 'Instalação de tomadas, chuveiros e quadros de força. Atendimento 24h para emergências.',
    yearsExperience: 15,
    services: [
      { id: 's4', title: 'Instalação de Chuveiro', category: 'eletricista', description: 'Instalação elétrica segura', priceMin: 80, priceMax: 120, unit: 'serviço' }
    ],
    reviews: []
  },
  {
    id: '4',
    name: 'Fernanda Lima',
    title: 'Manicure e Pedicure',
    rating: 5.0,
    totalReviews: 210,
    verified: true,
    distance: 0.8,
    location: 'Moema, São Paulo',
    description: 'Atendimento a domicílio com materiais esterilizados.',
    yearsExperience: 8,
    services: [
      { id: 's5', title: 'Pé e Mão', category: 'beleza', description: 'Cutilagem e esmaltação', priceMin: 60, priceMax: 80, unit: 'serviço' }
    ],
    reviews: []
  },
  // Health professionals (fictitious demo data: CRM numbers are placeholders)
  {
    id: 'doc-1',
    name: 'Dr. Roberto Costa',
    title: 'Cardiologista',
    rating: 5.0,
    totalReviews: 324,
    verified: true,
    distance: 3.5,
    location: 'Bela Vista, São Paulo',
    description: 'Perfil fictício de demonstração. Cardiologia clínica com foco em prevenção cardiovascular.',
    yearsExperience: 15,
    services: [
      { id: 'm1', title: 'Consulta Cardiológica', category: 'health', description: 'Avaliação clínica completa', priceMin: 350, priceMax: 350, unit: 'serviço' },
      { id: 'm2', title: 'Eletrocardiograma', category: 'health', description: 'Exame realizado no consultório', priceMin: 100, priceMax: 100, unit: 'serviço' }
    ],
    reviews: [
      { id: 'mr1', clientName: 'Carla S.', rating: 5, comment: 'Excelente médico! Muito atencioso e explicou tudo com calma.', date: '10/01/2024', tags: ['Atencioso', 'Pontual'] },
      { id: 'mr2', clientName: 'Jorge P.', rating: 5, comment: 'Consultório impecável e ótima localização.', date: '05/01/2024', tags: ['Instalações'] }
    ],
    medicalInfo: {
      crm: 'SP 000000 (DEMO)',
      specialties: ['Cardiologia'],
      insurances: ['Convênio A (exemplo)', 'Convênio B (exemplo)', 'Particular'],
      diseases: ['Hipertensão', 'Arritmia', 'Insuficiência Cardíaca', 'Angina'],
      languages: ['Português', 'Inglês', 'Espanhol'],
      education: [
        'Graduação em Medicina (exemplo)',
        'Residência em Cardiologia (exemplo)'
      ],
      address: {
        street: 'Rua de Exemplo, 100',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        zip: '01310-100',
        latitude: -23.561684,
        longitude: -46.655981
      },
      telemedicinePrice: 300,
      inPersonPrice: 350,
      nextAvailableSlots: [
        new Date(new Date().setHours(14, 0, 0, 0)).toISOString(),
        new Date(new Date().setHours(15, 30, 0, 0)).toISOString(),
        new Date(new Date().setHours(17, 0, 0, 0)).toISOString(),
        new Date(new Date().setDate(new Date().getDate() + 1)).toISOString()
      ]
    }
  },
  {
    id: 'doc-2',
    name: 'Dra. Juliana Martins',
    title: 'Dermatologista',
    rating: 4.9,
    totalReviews: 180,
    verified: true,
    distance: 1.0,
    location: 'Itaim Bibi, São Paulo',
    description: 'Perfil fictício de demonstração. Dermatologia clínica.',
    yearsExperience: 8,
    services: [
      { id: 'm3', title: 'Consulta Dermatológica', category: 'health', description: 'Análise de pele e cabelos', priceMin: 400, priceMax: 400, unit: 'serviço' }
    ],
    reviews: [
      { id: 'mr3', clientName: 'Ana L.', rating: 5, comment: 'Amei o atendimento! Super cuidadosa.', date: '12/01/2024', tags: ['Delicada'] }
    ],
    medicalInfo: {
      crm: 'SP 000001 (DEMO)',
      specialties: ['Dermatologia'],
      insurances: ['Particular', 'Reembolso'],
      diseases: ['Acne', 'Melasma', 'Queda de Cabelo', 'Dermatite'],
      languages: ['Português', 'Inglês'],
      education: [
        'Graduação em Medicina (exemplo)',
        'Residência em Dermatologia (exemplo)'
      ],
      address: {
        street: 'Rua de Exemplo, 200',
        neighborhood: 'Itaim Bibi',
        city: 'São Paulo',
        zip: '04534-003',
        latitude: -23.586,
        longitude: -46.678
      },
      telemedicinePrice: 350,
      inPersonPrice: 400,
      nextAvailableSlots: [
        new Date(new Date().setDate(new Date().getDate() + 2)).toISOString()
      ]
    }
  }
];

export const MOCK_REQUESTS: ServiceRequest[] = [
  { id: 'WE-2023001', providerId: '1', providerName: 'João Santos', serviceTitle: 'Pintura Interna', date: '28/10/2023', status: RequestStatus.NEGOTIATING, price: 350 },
  { id: 'WE-2023002', providerId: '2', providerName: 'Ana Oliveira', serviceTitle: 'Faxina Completa', date: '05/11/2023', status: RequestStatus.CONFIRMED, price: 200 },
  { id: 'WE-2023003', providerId: '3', providerName: 'Carlos Mendes', serviceTitle: 'Troca de Fiação', date: '12/10/2023', status: RequestStatus.COMPLETED, price: 500 },
];

export const MOCK_MEDICAL_RECORDS: MedicalRecord[] = [
  {
    id: 'MR-001',
    patientName: 'Paciente Fictício A',
    date: '10/01/2026',
    serviceType: 'Cardiologia (exemplo)',
    anamnese: 'Texto de exemplo para demonstração da interface. Não é dado de paciente real.',
    evolution: 'Texto de exemplo.',
    prescription: 'Texto de exemplo.'
  },
  {
    id: 'MR-002',
    patientName: 'Paciente Fictício B',
    date: '15/01/2026',
    serviceType: 'Dermatologia (exemplo)',
    anamnese: 'Texto de exemplo para demonstração da interface. Não é dado de paciente real.',
    evolution: 'Texto de exemplo.',
    prescription: 'Texto de exemplo.'
  }
];