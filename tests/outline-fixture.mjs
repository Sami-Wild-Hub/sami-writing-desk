// Fictional outline data shared by browser and unit verification.
export function outlineFixture() {
  const groups = ['Ann × Bo', 'Cy × Dee', 'The Lantern'].map((title, i) => ({ id: `G0${i + 1}`, title, summary: `${title} storyline`, source_storyline_ids: [`S0${i + 1}`], kinds: [i === 2 ? 'EVENT' : 'RELATIONSHIP'], sections: {}, awaiting_era: [] }));
  const specs = [['E001','G01','CURRENT',1],['E002','G01','CURRENT',2],['E003','G01','PAST',1],['E004','G02','CURRENT',1],['E005','G02','CURRENT',2],['E006','G03','CURRENT',1],['U001','G02','CURRENT',0],['U002','G03','UNASSIGNED',0]];
  const plot_data = {
    schema_version: '5.0', source_file: 'fictional.xmind', data_policy: 'Preserve sources',
    beats: Array.from({ length: 6 }, (_, i) => ({ beat_id: `A${Math.floor(i / 2) + 1}-B${i % 2 + 1}`, act: Math.floor(i / 2) + 1, beat: i % 2 + 1 })),
    storyline_groups: groups, storylines: groups.map(g => ({ id: g.source_storyline_ids[0], title: g.title, storyline_group_id: g.id })),
    source_nodes: [{ id: 'source-one', title: 'Original lantern' }], branches: [{ branch_id: 'BR001', title: 'Original branch' }],
    plot_units: specs.map(([unit_id, storyline_group_id, era, sequence]) => ({ unit_id, storyline_group_id, storyline_id: groups.find(g => g.id === storyline_group_id).source_storyline_ids[0], era, sequence, kind: storyline_group_id === 'G03' ? 'EVENT' : 'RELATIONSHIP', content: `${unit_id} fictional turn`, element_title: `${unit_id} stage`, details: ['First detail', 'Second detail'], source_refs: 'Fictional chapter', source_unit_ids: ['U001'], status: unit_id === 'E001' ? 'WRITTEN' : 'PLANNED', is_editorial_element: unit_id.startsWith('E'), is_custom: unit_id.startsWith('E'), source_id: 'source-one', source_group: 'Original', original_act: 1, original_beat: 1 })),
  };
  const plan = { schema_version: '5.0', placements: plot_data.plot_units.filter(u => u.is_editorial_element).map((u, i) => ({ unit_id: u.unit_id, beat_id: ['E002','E005'].includes(u.unit_id) ? 'A1-B2' : 'A1-B1', era: u.era, order: (i + 1) * 10 })), kind_overrides: {}, beat_notes: { 'A1-B1': 'Opening turn' } };
  return { plot_data, plan, config: { spineGroupId: 'G01', spineTitle: 'Ann × Bo | Main line' } };
}
