// Cookie cutter recipes retain exact source curves in millimeters. Geometry is
// built on detached copies in the worker; previews never alter drawing paths.
export function cookieError(feature){
  if(!feature.cut||!Array.isArray(feature.cut.profile)||feature.cut.profile.length!==1)return 'Choose one closed cut outline. Separate disconnected outlines into individual cutters.';
  if(!Array.isArray(feature.emboss)||feature.emboss.length>32)return 'Choose up to 32 filled emboss paths.';
  const positive=value=>Number.isFinite(value)&&value>0&&value<=1000;
  if(!positive(feature.wallThickness)||!positive(feature.cutHeight))return 'Use positive cutting-wall thickness and height up to 1,000 mm.';
  if(!positive(feature.baseThickness)||!Number.isFinite(feature.baseOffset)||feature.baseOffset<feature.wallThickness||feature.baseOffset>1000)return 'Base thickness must be positive. Base offset must be at least the wall thickness and no more than 1,000 mm.';
  if(!['solid','open'].includes(feature.baseMode))return 'Choose a solid or open-through base.';
  if(!Number.isFinite(feature.embossSetback)||feature.embossSetback<=0||feature.embossSetback>1000||feature.emboss.length&&feature.embossSetback>=feature.cutHeight)return 'Set the emboss top below the cutting edge by more than zero and less than the cutting height.';
  if(!Number.isFinite(feature.draftAngle)||feature.draftAngle<0||feature.draftAngle>60)return 'Use an emboss draft angle from 0° to 60° from vertical.';
  if(!positive(feature.bridgeWidth))return 'Use a positive support bridge width up to 1,000 mm.';
  return '';
}
