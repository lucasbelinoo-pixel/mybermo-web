// lib/engine.js
// Motor de cálculo PURO (sem DOM, sem window, sem localStorage) para a família
// "Redução de Pressão" (vapor saturado, vapor superaquecido, ar comprimido, água).
// Extraído verbatim de index.html (mesmos números/coeficientes/fórmulas) para
// rodar no servidor, atrás do dispatcher único api/calc.js (Vercel Function).
//
// Origem de cada trecho (linhas do index.html na época da extração):
//  - ENG (tabelas de vapor saturado): linha 1923
//  - VALV (catálogo de válvulas): linha 1925
//  - SCHED (diâmetros internos por schedule): linhas 1934-1935
//  - CVANG / CVANG_DEG (curva Cv x ângulo, borboletas): linhas 1945-1946
//  - VB_PT (pressão x temperatura, borboletas VB-121/122): linha 1975
//  - AGUA_MODELS: linha 2921
//  - interp / interpC: linhas 1979-2004
//  - vaporTemp / vaporVol / vaporPress: linhas 2005-2007
//  - ATM: linha 2009
//  - cvReq, parseInch, vaporVolWet, sortedSizes, pmaxValv, aberturaFrac: linhas 2487-2510
//  - steamLookup: linha 4035
//  - valveAbas: linha 2939
//  - IIFE que injeta as borboletas wafer VB-2000/VB-2500/VB-5500 em VALV/CVANG e
//    marca _abas:["agua"] em VDB para essas 3 (portanto NÃO aparecem na aba 'vapor'):
//    linhas 2960-2971

/* ---------- tabelas de propriedades (verbatim) ---------- */
const ENG = {"steam": {"T_C": [0.01, 4.0, 5.0, 6.0, 8.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0, 21.0, 22.0, 23.0, 24.0, 25.0, 26.0, 27.0, 28.0, 29.0, 30.0, 31.0, 32.0, 33.0, 34.0, 35.0, 36.0, 38.0, 40.0, 45.0, 50.0, 55.0, 60.0, 65.0, 70.0, 75.0, 80.0, 85.0, 90.0, 95.0, 100.0, 110.0, 120.0, 130.0, 140.0, 150.0, 160.0, 170.0, 180.0, 190.0, 200.0, 210.0, 220.0, 230.0, 240.0, 250.0, 260.0, 270.0, 280.0, 290.0, 300.0, 320.0, 324.8, 330.9, 336.8, 340.0, 342.2, 347.4, 352.4, 357.1, 360.0, 361.5, 365.8, 374.14], "P_bara": [0.00611, 0.00813, 0.00872, 0.00935, 0.01072, 0.01228, 0.01312, 0.01402, 0.01497, 0.01598, 0.01705, 0.01818, 0.01938, 0.02064, 0.02198, 0.02339, 0.02487, 0.02645, 0.0281, 0.02985, 0.03169, 0.03363, 0.03567, 0.03782, 0.04008, 0.04246, 0.04496, 0.04759, 0.05034, 0.05324, 0.05628, 0.05947, 0.06632, 0.07384, 0.09593, 0.1235, 0.1576, 0.1994, 0.2503, 0.3119, 0.3858, 0.4739, 0.5783, 0.7014, 0.8455, 1.014, 1.433, 1.985, 2.701, 3.613, 4.758, 6.178, 7.917, 10.02, 12.54, 15.54, 19.06, 23.18, 27.95, 33.44, 39.73, 46.88, 54.99, 64.12, 74.36, 85.81, 112.7, 120.0, 130.0, 140.0, 145.9, 150.0, 160.0, 170.0, 180.0, 186.5, 190.0, 200.0, 220.9], "vV_m3kg": [206.136, 157.232, 147.12, 137.734, 120.917, 106.379, 99.857, 93.784, 88.124, 82.848, 77.926, 73.333, 69.044, 65.038, 61.293, 57.791, 54.514, 51.447, 48.574, 45.883, 43.36, 40.994, 38.774, 36.69, 34.733, 32.894, 31.165, 29.54, 28.011, 26.571, 25.216, 23.94, 21.602, 19.523, 15.258, 12.032, 9.568, 7.671, 6.197, 5.042, 4.131, 3.407, 2.828, 2.361, 1.982, 1.673, 1.21, 0.8919, 0.6685, 0.5089, 0.3928, 0.3071, 0.2428, 0.1941, 0.1565, 0.1274, 0.1044, 0.08619, 0.07158, 0.05976, 0.05013, 0.04221, 0.03564, 0.3017, 0.02557, 0.02167, 0.01549, 0.01426, 0.01278, 0.01149, 0.0108, 0.01034, 0.009306, 0.00864, 0.007489, 0.006945, 0.006657, 0.005834, 0.003155], "vL_mm3kg": [1.0002, 1.0001, 1.0001, 1.0001, 1.0002, 1.0004, 1.0004, 1.0005, 1.0007, 1.0008, 1.0009, 1.0011, 1.0012, 1.0014, 1.0016, 1.0018, 1.002, 1.0022, 1.0024, 1.0027, 1.0029, 1.0032, 1.0035, 1.0037, 1.004, 1.0043, 1.0046, 1.005, 1.0053, 1.0056, 1.006, 1.0063, 1.0078, 1.0078, 1.0099, 1.0121, 1.0146, 1.0172, 1.0199, 1.0228, 1.0259, 1.0291, 1.0325, 1.036, 1.0397, 1.0435, 1.0516, 1.0603, 1.0697, 1.0797, 1.0905, 1.102, 1.1143, 1.1274, 1.1414, 1.1565, 1.01726, 1.19, 1.2088, 1.2291, 1.2512, 1.2755, 1.3023, 1.3321, 1.356, 1.4036, 1.4988, 1.5267, 1.5671, 1.6107, 1.6379, 1.6581, 1.7107, 1.7702, 1.8397, 1.8925, 1.9243, 2.036, 3.155], "hL_kJkg": [0.01, 16.78, 20.98, 25.2, 33.6, 42.01, 46.2, 50.41, 54.6, 58.8, 62.99, 67.19, 71.38, 75.58, 79.77, 83.96, 88.14, 92.33, 96.52, 100.7, 104.89, 109.07, 113.25, 117.43, 121.61, 125.79, 129.97, 134.15, 138.33, 142.5, 146.68, 150.86, 159.21, 167.57, 188.45, 209.33, 230.23, 251.13, 272.06, 292.98, 313.93, 334.91, 355.9, 376.92, 397.96, 419.04, 461.3, 503.71, 546.31, 589.13, 632.2, 675.55, 719.21, 763.22, 807.62, 852.45, 897.76, 943.62, 990.12, 1037.3, 1085.4, 1134.4, 1184.5, 1236.0, 1289.1, 1344.0, 1461.5, 1491.3, 1531.5, 1571.1, 1594.2, 1610.5, 1650.1, 1690.3, 1732.0, 1760.5, 1776.5, 1826.3, 2099.3], "hV_kJkg": [2501.4, 2508.7, 2510.6, 2512.4, 2516.1, 2519.8, 2521.6, 2523.4, 2525.3, 2527.1, 2528.9, 2530.8, 2532.6, 2534.4, 2536.2, 2538.1, 2539.9, 2541.7, 2543.5, 2545.4, 2547.2, 2549.0, 2550.8, 2552.6, 2554.5, 2556.3, 2558.1, 2559.9, 2561.7, 2563.5, 2565.3, 2567.1, 2570.7, 2574.3, 2583.2, 2592.1, 2600.9, 2609.6, 2618.3, 2626.8, 2635.3, 2643.7, 2651.9, 2660.1, 2668.1, 2676.1, 2691.5, 2706.3, 2720.5, 2733.9, 2746.5, 2758.1, 2768.7, 2778.2, 2786.4, 2793.2, 2798.5, 2802.1, 2804.0, 2803.8, 2801.5, 2796.6, 2789.7, 2779.6, 2766.2, 2749.0, 2700.1, 2684.9, 2662.2, 2637.6, 2622.0, 2610.5, 2580.6, 2547.2, 2509.1, 2481.0, 2464.5, 2409.7, 2099.3]}, "water": {"T_C": [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0, 21.0, 22.0, 23.0, 24.0, 25.0, 26.0, 27.0, 28.0, 29.0, 30.0, 31.0, 32.0, 33.0, 34.0, 35.0, 36.0, 37.0, 38.0, 39.0, 40.0, 41.0, 42.0, 43.0, 44.0, 45.0, 46.0, 47.0, 48.0, 49.0, 50.0, 51.0, 52.0, 53.0, 54.0, 55.0, 56.0, 57.0, 58.0, 59.0, 60.0, 61.0, 62.0, 63.0, 64.0, 65.0, 66.0, 67.0, 68.0, 69.0, 70.0, 71.0, 72.0, 73.0, 74.0, 75.0, 76.0, 77.0, 78.0, 79.0, 80.0, 81.0, 82.0, 83.0, 84.0, 85.0, 86.0, 87.0, 88.0, 89.0, 90.0, 91.0, 92.0, 93.0, 94.0, 95.0, 96.0, 97.0, 98.0, 99.0, 100.0], "rho_kgm3": [999.84, 999.9, 999.94, 999.97, 999.97, 999.97, 999.94, 999.9, 999.85, 999.78, 999.7, 999.61, 999.5, 999.38, 999.25, 999.1, 998.94, 998.78, 998.6, 998.41, 998.2, 997.99, 997.77, 997.54, 997.3, 997.04, 996.78, 996.51, 996.23, 995.94, 995.65, 995.34, 995.02, 994.7, 994.37, 994.03, 993.68, 993.33, 992.96, 992.59, 992.21, 991.83, 991.43, 991.03, 990.62, 990.21, 989.79, 989.36, 988.92, 988.48, 988.03, 987.57, 987.11, 986.64, 986.17, 985.69, 985.2, 984.71, 984.21, 983.7, 983.19, 982.67, 982.15, 981.62, 981.09, 980.54, 980.0, 979.45, 978.89, 978.33, 977.76, 977.18, 976.61, 976.02, 975.43, 974.84, 974.24, 973.63, 973.02, 972.4, 971.78, 971.16, 970.53, 969.89, 969.25, 968.6, 967.95, 967.3, 966.64, 965.97, 965.3, 964.63, 963.95, 963.26, 962.57, 961.88, 961.18, 960.48, 959.77, 959.06, 958.63]}, "valvSeg": {"bocal": ["15/25", "20/32", "25/40", "32/50", "40/65", "50/80", "65/100", "80/125", "100/150", "125/200", "150/250", "200/300", "250/350", "15/20", "20/25", "25/32"], "d0_mm": [13.0, 18.0, 22.5, 29.0, 36.0, 45.0, 58.5, 72.0, 90.0, 106.0, 125.0, 165.0, 200.0, 12.0, 15.0, 18.0], "A0_mm2": [133.0, 254.0, 398.0, 661.0, 1018.0, 1590.0, 2688.0, 4072.0, 6362.0, 8825.0, 12272.0, 21382.0, 31416.0, 113.0, 177.0, 254.0], "kdr_vapor": [[0.2, 0.56, 0.57, 0.51, 0.58, 0.5, 0.0, 0.0, 0.53], [0.3, 0.57, 0.59, 0.52, 0.58, 0.51, 0.46, 0.4, 0.55], [0.4, 0.59, 0.61, 0.54, 0.59, 0.52, 0.47, 0.42, 0.57], [0.5, 0.6, 0.63, 0.55, 0.6, 0.54, 0.49, 0.44, 0.58], [0.6, 0.61, 0.64, 0.56, 0.61, 0.55, 0.51, 0.46, 0.6], [0.7, 0.63, 0.66, 0.57, 0.62, 0.56, 0.53, 0.47, 0.61], [0.8, 0.64, 0.68, 0.58, 0.63, 0.57, 0.54, 0.48, 0.63], [0.9, 0.65, 0.69, 0.59, 0.64, 0.58, 0.55, 0.5, 0.64], [1.0, 0.66, 0.7, 0.6, 0.65, 0.59, 0.56, 0.51, 0.65], [1.2, 0.68, 0.73, 0.62, 0.66, 0.61, 0.58, 0.53, 0.67], [1.5, 0.7, 0.75, 0.65, 0.68, 0.64, 0.6, 0.54, 0.7], [1.6, 0.7, 0.68, 0.65, 0.68, 0.64, 0.6, 0.55, 0.7], [1.8, 0.71, 0.69, 0.66, 0.69, 0.66, 0.61, 0.56, 0.72], [2.0, 0.72, 0.7, 0.67, 0.7, 0.67, 0.62, 0.57, 0.73], [2.5, 0.73, 0.72, 0.68, 0.72, 0.69, 0.63, 0.58, 0.74], [3.0, 0.73, 0.73, 0.69, 0.73, 0.7, 0.63, 0.59, 0.74], [3.5, 0.74, 0.74, 0.7, 0.74, 0.7, 0.64, 0.6, 0.75], [3.5, 0.74, 0.74, 0.7, 0.74, 0.7, 0.64, 0.6, 0.75], [4.0, 0.74, 0.74, 0.7, 0.75, 0.7, 0.64, 0.6, 0.75]], "kdr_agua_911": [0.52, 0.54, 0.48, 0.45, 0.56, 0.52], "kdr_agua_943": [[0.0, 0.0, 0.53], [0.45, 0.42, 0.53]], "overpressure_default": 10, "k_vapor": 1.135}};

const VALV = {"32470": {"PMax_barg": 13.0, "sizes": {"1": 11.8, "1.1/2": 29.4, "2": 47.1, "3": 117.7, "4": 188.2, "6": 470.6, "8": 741.2}, "curso": {"1": 20.0, "1.1/2": 30.0, "2": 30.0, "3": 30.0, "4": 30.0, "6": 50.0, "8": 65.0}}, "12440": {"PMax_barg": 12.0, "sizes": {"1/2": 4.7, "3/4": 7.4, "1": 11.8, "1.1/4": 18.8, "1.1/2": 29.4, "2": 47.1, "2.1/2": 74.1, "3": 117.7, "4": 188.2, "6": 470.6, "8": 741.2, "10": 1176.5}, "curso": {"1": 20.0, "1.1/2": 20.0, "1.1/4": 20.0, "1/2": 20.0, "2": 20.0, "2.1/2": 30.0, "3": 30.0, "3/4": 20.0, "4": 30.0, "5": 50.0, "6": 50.0, "8": 65.0}}, "45440": {"PMax_barg": 40.0, "sizes": {"1/2": 3.9, "3/4": 6.3, "1": 9.8, "1.1/4": 15.0, "1.1/2": 23.4, "2": 33.2}, "curso": {"1": 20.0, "1.1/2": 20.0, "1.1/4": 20.0, "1/2": 20.0, "2": 20.0, "3/4": 20.0}}, "35470": {"PMax_barg": 41.0, "sizes": {"1": 11.8, "1.1/2": 29.5, "2": 47.2, "3": 118.0, "4": 188.8, "6": 468.0, "8": 743.4}, "curso": {"1": 20.0, "1.1/2": 30.0, "2": 30.0, "3": 30.0, "4": 30.0, "6": 50.0, "8": 65.0}}, "32448": {"PMax_barg": 12.0, "sizes": {"1/2": 4.7, "3/4": 7.4, "1": 11.7, "1.1/4": 18.8, "1.1/2": 29.3, "2": 46.8, "2.1/2": 73.7, "3": 117.0, "4": 187.2}, "curso": {"1": 10.0, "1.1/2": 15.0, "1.1/4": 15.0, "1/2": 10.0, "2": 15.0, "2.1/2": 20.0, "3": 25.0, "3/4": 10.0, "4": 30.0}}, "12701": {"PMax_barg": 12.0, "sizes": {"1/2": 3.76, "3/4": 5.9, "1": 9.41, "1.1/4": 14.71, "1.1/2": 23.53, "2": 37.65, "2.1/2": 58.82, "3": 94.18, "4": 147.06}, "curso": {"1": 6.0, "1.1/2": 8.0, "1.1/4": 8.0, "1/2": 4.0, "2": 10.0, "2.1/2": 11.0, "3": 13.0, "3/4": 5.0, "4": 16.0, "5": 19.0, "6": 22.0}}, "H-3600": {"PMax_barg": 11.0, "sizes": {"1/2": 5.49, "3/4": 11.09, "1": 21.13, "1.1/4": 26.97, "1.1/2": 38.41, "2": 61.64, "2.1/2": 95.73}}, "RE1": {"PMax_barg": 16.0, "sizes": {"1/2": 0.7, "3/4": 1.05, "1": 1.83}}, "VRB41": {"PMax_barg": 16.0, "sizes": {"1/2": 3.3, "3/4": 6.4, "1": 9.5, "1.1/4": 14.0, "1.1/2": 19.9, "2": 32.8, "2.1/2": 53.2, "3": 70.3, "4": 109.2, "5": 170.8, "6": 210.6, "8": 351.0}, "curso": {"1": 160.0, "1.1/2": 200.0, "1.1/4": 180.0, "1/2": 147.0, "2": 230.0, "2.1/2": 250.0, "3": 310.0, "3/4": 154.0, "4": 350.0}}, "H-3601": {"PMax_barg": 41, "sizes": {"1/2": 5.148, "3/4": 9.126, "1": 13.923, "1.1/2": 28.665, "2": 47.619}}, "VB-121": {"PMax_barg": 20, "sizes": {"2": 128.0, "2.1/2": 149.0, "3": 206.0, "4": 386.0, "5": 736.0, "6": 1175.0, "8": 2290.0, "10": 3558.0}}, "VB-122": {"PMax_barg": 20, "sizes": {"3": 165.0, "4": 400.0, "6": 1050.0, "8": 1800.0, "10": 3150.0}}};

const SCHED = {"40": {"1/8": 6.84, "1/4": 9.25, "3/8": 12.52, "1/2": 15.8, "3/4": 20.93, "1": 26.64, "1.1/4": 35.05, "1.1/2": 40.89, "2": 52.5, "2.1/2": 62.71, "3": 77.93, "4": 102.26, "5": 128.19, "6": 154.05, "8": 202.72, "10": 254.51, "12": 303.23, "14": 333.34, "16": 381.0, "18": 428.66, "20": 477.82, "24": 574.65}, "80": {"1/8": 5.46, "1/4": 7.66, "3/8": 10.7, "1/2": 13.86, "3/4": 18.85, "1": 24.31, "1.1/4": 32.46, "1.1/2": 38.1, "2": 49.25, "2.1/2": 59.0, "3": 73.66, "4": 97.18, "5": 122.25, "6": 146.33, "8": 193.68, "10": 242.82, "12": 288.95, "14": 317.5, "16": 363.52, "18": 409.55, "20": 455.62, "24": 547.69}};
Object.assign(SCHED,{"5":{"1/8": 7.81, "1/4": 10.42, "3/8": 13.85, "1/2": 18.04, "3/4": 23.37, "1": 30.1, "1.1/4": 38.86, "1.1/2": 44.96, "2": 57.03, "2.1/2": 68.81, "3": 84.68, "4": 110.08, "5": 135.76, "6": 162.74, "8": 213.54, "10": 266.25, "12": 315.93, "14": 347.68, "16": 398.02, "18": 448.82, "20": 498.44, "24": 598.52},"10":{"1/8": 7.81, "1/4": 10.42, "3/8": 13.85, "1/2": 17.12, "3/4": 22.45, "1": 27.86, "1.1/4": 36.62, "1.1/2": 42.72, "2": 54.79, "2.1/2": 66.93, "3": 82.8, "4": 108.2, "5": 134.5, "6": 161.48, "8": 211.56, "10": 264.67, "12": 314.71, "14": 346.04, "16": 396.84, "18": 447.64, "20": 496.92, "24": 596.9}});

const CVANG = {"VB-121": {"2": [3, 7, 17, 27, 41, 63, 85, 106, 128], "2.1/2": [4, 9, 21, 35, 55, 80, 104, 135, 149], "3": [7, 19, 40, 62, 97, 134, 166, 194, 206], "4": [9, 30, 62, 98, 147, 223, 308, 368, 386], "5": [15, 50, 96, 162, 260, 384, 500, 637, 736], "6": [38, 93, 163, 267, 415, 607, 813, 1047, 1175], "8": [75, 135, 305, 510, 750, 1110, 1537, 2006, 2290], "10": [92, 250, 495, 770, 1125, 1670, 2346, 2980, 3558]}, "VB-122": {"3": [5, 14, 25, 36, 51, 74, 114, 145, 165], "4": [13, 35, 60, 88, 123, 178, 276, 351, 400], "6": [34, 92, 157, 232, 323, 468, 726, 923, 1050], "8": [60, 157, 270, 397, 554, 802, 1245, 1582, 1800], "10": [104, 275, 472, 695, 970, 1404, 2178, 2769, 3150]}};
const CVANG_DEG = [10, 20, 30, 40, 50, 60, 70, 80, 90];

const VB_PT = {"VB-121": [[38, 19.6], [100, 17.7], [150, 15.8], [200, 13.8], [250, 12.1]], "VB-122": [[38, 51.1], [100, 46.6], [150, 45.1], [200, 43.8], [250, 41.9]]};

let AGUA_MODELS = ["12440","32448","32470","35470","45440","H-3600","H-3601","VB-121","VB-122"];

// VDB minimalista: no index.html o objeto completo carrega textos/imagens da UI
// (não necessários para o cálculo). O único campo relevante para o cálculo é
// "_abas", usado por valveAbas() para decidir em quais abas cada modelo aparece.
// A IIFE abaixo (verbatim quanto à lógica) replica o que index.html faz: injeta
// as borboletas wafer VB-2000/VB-2500/VB-5500 em VALV/CVANG e marca essas 3 como
// exclusivas da aba "agua" (portanto elas NÃO entram na aba "vapor").
const VDB = {};
(function () {
  const _wsizes = {"1.1/2": 64, "2": 86, "2.1/2": 170, "3": 280, "4": 530, "5": 750, "6": 1580, "8": 2650, "10": 4000, "12": 7350};
  const _wcvang = {"1.1/2": [0.5, 3.9, 9.0, 16, 25, 41, 56, 62, 64], "2": [0.6, 5.1, 12, 21, 34, 56, 76, 84, 86], "2.1/2": [3.4, 9.7, 22, 36, 59, 88, 116, 154, 170], "3": [4.8, 13, 27, 50, 81, 127, 209, 259, 280], "4": [6.4, 22, 44, 82, 159, 271, 406, 503, 530], "5": [7.6, 26, 60, 104, 183, 285, 444, 626, 750], "6": [14, 55, 124, 221, 351, 590, 928, 1418, 1580], "8": [21, 87, 220, 403, 665, 1073, 1676, 2423, 2650], "10": [44, 200, 416, 699, 1129, 1749, 2499, 3828, 4000], "12": [56, 227, 516, 916, 1411, 2289, 3684, 5793, 7350]};
  ['VB-2000', 'VB-2500', 'VB-5500'].forEach(function (m) {
    VALV[m] = { PMax_barg: 16, sizes: Object.assign({}, _wsizes) };
    CVANG[m] = JSON.parse(JSON.stringify(_wcvang));
    if (!AGUA_MODELS.includes(m)) AGUA_MODELS.push(m);
    VDB[m] = { _abas: ["agua"] };
  });
})();

/* ---------- helpers de interpolação (verbatim) ---------- */
function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 0; i < xs.length - 1; i++) if (xs[i] <= x && x <= xs[i + 1]) { const f = (x - xs[i]) / (xs[i + 1] - xs[i]); return ys[i] + (ys[i + 1] - ys[i]) * f; }
  return ys[ys.length - 1];
}
function interpC(xs, ys, x) {
  const n = xs.length;
  if (n < 3) return interp(xs, ys, x);
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let k = 0; while (k < n - 1 && x > xs[k + 1]) k++;
  const H = i => xs[i + 1] - xs[i], D = i => (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  const slope = i => {
    if (i <= 0) return D(0);
    if (i >= n - 1) return D(n - 2);
    const dm = D(i - 1), dp = D(i);
    if (dm * dp <= 0) return 0;
    const hm = H(i - 1), hp = H(i), w1 = 2 * hp + hm, w2 = hp + 2 * hm;
    return (w1 + w2) / (w1 / dm + w2 / dp);
  };
  const x0 = xs[k], x1 = xs[k + 1], y0 = ys[k], y1 = ys[k + 1], h = x1 - x0, t = (x - x0) / h;
  const m0 = slope(k), m1 = slope(k + 1);
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  return h00 * y0 + h10 * h * m0 + h01 * y1 + h11 * h * m1;
}

const vaporVol = b => interpC(ENG.steam.P_bara, ENG.steam.vV_m3kg, b + 1.0);
const vaporTemp = b => interpC(ENG.steam.P_bara, ENG.steam.T_C, b + 1.0);
const vaporPress = Tc => interpC(ENG.steam.T_C, ENG.steam.P_bara, Tc); // pressão de saturação, bar(abs)

const ATM = 1.01325;

/* ---------- redução de pressão (verbatim, linhas ~2487-2510 do index.html) ---------- */
function cvReq(P1, P2, mp) { return (P1 - P2 < 0.42 * P1) ? mp / (11.92 * Math.sqrt((P1 - P2) * (P1 + P2 + 2))) : mp / (9.6 * (P1 + 1)); }
function parseInch(s) { if (s.indexOf('.') >= 0) { const [a, b] = s.split('.'); const [n, d] = b.split('/'); return +a + (+n) / (+d); } if (s.indexOf('/') >= 0) { const [n, d] = s.split('/'); return (+n) / (+d); } return +s; }
// volume específico do vapor úmido conforme título (xf em fração 0-1): v = vL + x·(vV − vL)
function vaporVolWet(barg, xf) { const r = steamLookup(barg); const vV = r.vV, vL = r.vL / 1000; return vL + xf * (vV - vL); }
function sortedSizes(md) { return Object.entries(md.sizes).sort((a, b) => parseInch(a[0]) - parseInch(b[0])); }
// Pmáx admissível: borboletas (VB) variam com a temperatura (tabela pressão-temperatura)
function pmaxValv(modelo, tempC) {
  const t = VB_PT[modelo];
  if (t && t.length) {
    if (tempC <= t[0][0]) return t[0][1];
    if (tempC >= t[t.length - 1][0]) return t[t.length - 1][1];
    for (let i = 1; i < t.length; i++) { if (tempC <= t[i][0]) { const a = t[i - 1], b = t[i]; return a[1] + (b[1] - a[1]) * (tempC - a[0]) / (b[0] - a[0]); } }
  }
  return (VALV[modelo] && VALV[modelo].PMax_barg);
}
function aberturaFrac(modelo, sz, cvReqVal, cvFull) {
  const tab = CVANG[modelo] && CVANG[modelo][sz];
  if (tab) {
    const ang = CVANG_DEG;
    if (cvReqVal <= tab[0]) return ang[0] / 90;
    if (cvReqVal >= tab[tab.length - 1]) return 1;
    for (let i = 0; i < tab.length - 1; i++) { if (cvReqVal >= tab[i] && cvReqVal <= tab[i + 1]) { const t = (cvReqVal - tab[i]) / (tab[i + 1] - tab[i]); return (ang[i] + t * (ang[i + 1] - ang[i])) / 90; } }
    return 1;
  }
  return Math.log(cvReqVal / cvFull) / Math.log(50) + 1; // globo equal-% (rangeabilidade 50)
}

// abas em que o modelo aparece (padrão; sobrescrevível no cadastro -> VDB[modelo]._abas)
// (verbatim, linha ~2939 do index.html)
function valveAbas(m) {
  const o = VDB[m] && VDB[m]._abas;
  if (Array.isArray(o) && o.length) return o;
  const a = ['vapor', 'vaporsup', 'ar'];
  if (AGUA_MODELS.includes(m)) a.push('agua');
  return a;
}
// No cliente, isAtivo() também filtra por modelos desativados no cadastro local
// (estado do navegador). No servidor NÃO replicamos esse filtro (ver instruções) —
// modelsForTabAll() devolve todos os modelos de VALV que atendem a aba, e o
// endpoint usa a lista `activeModels` vinda do cliente quando ela é informada.
function modelsForTabAll(tab) {
  return Object.keys(VALV).filter(m => valveAbas(m).includes(tab));
}

/* ---------- propriedades do vapor saturado (verbatim, linha ~4035 do index.html) ---------- */
function steamLookup(barg) {
  const Pa = barg + ATM;
  const T = interpC(ENG.steam.P_bara, ENG.steam.T_C, Pa);
  const vV = interpC(ENG.steam.P_bara, ENG.steam.vV_m3kg, Pa);
  const vL = interpC(ENG.steam.P_bara, ENG.steam.vL_mm3kg, Pa);
  const hL = ENG.steam.hL_kJkg ? interpC(ENG.steam.P_bara, ENG.steam.hL_kJkg, Pa) : null;
  const hV = ENG.steam.hV_kJkg ? interpC(ENG.steam.P_bara, ENG.steam.hV_kJkg, Pa) : null;
  const lat = (hL != null && hV != null) ? (hV - hL) : null; // kJ/kg
  return { Pa, T, vV, vL, roV: 1 / vV, roL: 1000 / vL, lat };
}

/* ---------- computeReduc: motor do endpoint /api/reduc ---------- */
// Replica EXATAMENTE:
//  - MB.reduc.compute() (linhas ~2607-2626 do index.html) para CVp/regime/models/rows
//  - renderVelTable() (linha ~2692) para a tabela de velocidade
export function computeReduc({ pin, pout, flow, sch, x, activeModels } = {}) {
  pin = Number(pin);
  pout = Number(pout);
  flow = Number(flow);

  let err = null;
  if (pin <= pout) err = "Pressão de entrada deve ser maior que a de saída.";
  else if (flow <= 0) err = "Vazão deve ser maior que 0.";

  // tempIn/tempOut e regime são calculados sempre (mesmo com err), como no index.html
  const tempIn = vaporTemp(pin);
  const tempOut = vaporTemp(pout);
  const regime = (pin - pout < 0.42 * pin) ? "Subcrítico" : "Crítico";

  const CVp = err ? 0 : cvReq(pin, pout, flow);
  const kv = CVp * 0.865;

  const models = [];
  if (!err) {
    // Se o cliente mandar activeModels (mesmo array vazio = nenhum modelo ativo),
    // essa lista é autoritativa. Só cai no "todos os modelos" quando o campo
    // não foi enviado (undefined/null), conforme instrução do piloto.
    const list = Array.isArray(activeModels)
      ? activeModels.filter(m => VALV[m] && valveAbas(m).includes('vapor'))
      : modelsForTabAll('vapor');
    const _dpC = pin - pout;
    for (const modelo of list) {
      const md = VALV[modelo];
      if (!md) continue;
      const pmAdm = pmaxValv(modelo, tempIn);
      const excede = pmAdm != null && pin > pmAdm;
      const m = { modelo, pmAdm: (pmAdm == null ? null : pmAdm), excede, rows: [] };
      if (!excede) {
        m.rows = sortedSizes(md).map(([sz, cvv]) => {
          const Q = (flow / CVp) * cvv;
          const ab = aberturaFrac(modelo, sz, CVp, cvv);
          const _dm = (md.dpmax && md.dpmax[sz]);
          const dpOver = (_dm != null && _dm !== "" && _dpC > Number(_dm));
          return { sz, cvv, rcv: CVp / cvv, Q, ab, dpOver, dpm: (_dm == null || _dm === "") ? null : _dm };
        });
      }
      models.push(m);
    }
  }

  // ---- tabela de velocidade (renderVelTable, linha ~2692) ----
  let vel = [];
  if (!err) {
    const D = SCHED[sch] || SCHED['40'];
    const xpct = (x == null || isNaN(Number(x))) ? 100 : Number(x);
    const xf = Math.min(Math.max((xpct > 1 ? xpct / 100 : xpct), 0), 1);
    const order = Object.keys(D).sort((a, b) => parseInch(a) - parseInch(b));
    vel = order.map(sz => {
      const id = D[sz];
      const A = Math.PI / 4 * Math.pow(id / 1000, 2);
      const vin = (flow / 3600) * vaporVolWet(pin, xf) / A;
      const vout = (flow / 3600) * vaporVolWet(pout, xf) / A;
      return { sz, vin, vout };
    });
  }

  return { err, CVp, regime, tempIn, tempOut, kv, models, vel };
}

/* =========================================================================
 * FAMÍLIA DE REDUÇÃO — vapor superaquecido / ar comprimido / água
 * Extraído verbatim de index.html (linhas na época da extração desta parte):
 *  - isBorboleta: linha 2515
 *  - vaporVolSup, khSup: linhas 2733-2734 (renderReducSuper ~2738)
 *  - RHO_AR_N, arRho, arWmass, xtDefault, arXt, cvReqAr: linhas 2803-2820
 *    (renderReducAr ~2822)
 *  - aguaRho: linha ~2011 (junto de vaporVol/vaporTemp)
 *  - aguaRhoT, aguaSG, aguaDpChoked, cvReqAgua, fluxoAgua, aguaVol: linhas
 *    2949-2957 (renderReducAgua ~2998)
 * ========================================================================= */

// é borboleta (possui tabela Cv x ângulo)? — linha 2515
function isBorboleta(modelo) { return !!(CVANG[modelo]); }

/* ---------- vapor superaquecido (gás ideal) — linhas 2733-2734 ---------- */
function vaporVolSup(barg, Tc) { const r = steamLookup(barg); const Ts = vaporTemp(barg); return r.vV * ((Tc + 273.15) / (Ts + 273.15)); }
function khSup(P1barg, T1c) { const Ts = vaporTemp(P1barg); return (T1c > Ts) ? Math.sqrt((T1c + 273.15) / (Ts + 273.15)) : 1; }

/* ---------- ar comprimido (gás, IEC 60534-2-1) — linhas 2803-2820 ---------- */
const RHO_AR_N = 1.2922; // ar normal: 0 °C, 1,01325 bar (gás ideal)
function arRho(Pg, T1) { const ATMl = 1.01325; return ((Pg + ATMl) * 1e5) / (287.05 * ((isNaN(T1) ? 20 : T1) + 273.15)); }
function arWmass(Q, unit, Pg, T1) { // Q -> W [kg/h]
  if (unit === 'nm3h') return Q * RHO_AR_N;
  if (unit === 'm3h') return Q * arRho(Pg, T1);
  return Q; // kgh
}
function xtDefault(modelo) { return isBorboleta(modelo) ? 0.45 : 0.72; }
function arXt(modelo, sz) { const md = VALV[modelo] || {}; const v = md.xt && md.xt[sz]; return (v != null && v !== '') ? Number(v) : xtDefault(modelo); }
function cvReqAr(P1g, P2g, Wkgh, T1, xT) {
  const ATMl = 1.01325, Fk = 1.0;            // k_ar≈1,40 -> Fk≈1
  const P1a = P1g + ATMl, x = (P1g - P2g) / P1a;
  const xch = Fk * xT, xx = Math.min(x, xch), Y = 1 - xx / (3 * xch);
  const rho1 = arRho(P1g, T1);
  const Kv = Wkgh / (27.3 * Y * Math.sqrt(xx * P1a * rho1));
  return 1.156 * Kv;                       // Cv
}

/* ---------- água (redução de pressão) — linha ~2011 e 2949-2957 ---------- */
const aguaRho = t => interpC(ENG.water.T_C, ENG.water.rho_kgm3, t);
function aguaRhoT(T) { const r = aguaRho(T == null || isNaN(T) ? 20 : T); return (r == null || isNaN(r)) ? 998 : r; }
function aguaSG(T) { return aguaRhoT(T) / 1000; }
function aguaDpChoked(P1, T) { const FL = 0.9, Pc = 220.6, ATMl = 1.01325; const Tc = (T == null || isNaN(T)) ? 20 : T; const Pv = Math.max(vaporPress(Tc), 0); const FF = 0.96 - 0.28 * Math.sqrt(Math.max(Pv / Pc, 0)); return FL * FL * ((P1 + ATMl) - FF * Pv); }
function cvReqAgua(P1, P2, Qm3h, T) { const dp = P1 - P2; if (dp <= 0) return NaN; const sg = (T == null ? 1 : aguaSG(T)); const dch = aguaDpChoked(P1, T); const dpEff = (dch > 0 && dp > dch) ? dch : dp; return 1.16 * Qm3h * Math.sqrt(sg / dpEff); }
function fluxoAgua(P1, P2) { return (P1 - P2) < (P1 / 2) ? "Subcrítico" : "Crítico"; }
function aguaVol(flowInput, unit, T) { return unit === 'kg' ? (flowInput / aguaRhoT(T)) : flowInput; }

/* ---------- computeReducSuper: motor para renderReducSuper (~linha 2738) ---------- */
export function computeReducSuper({ pin, pout, flow, T1, sch, activeModels } = {}) {
  pin = Number(pin); pout = Number(pout); flow = Number(flow); T1 = Number(T1);
  const Tsat1 = vaporTemp(pin), Tsat2 = vaporTemp(pout);

  // err: string pronta para os dois casos SEM formatação por unidade (idêntico
  // ao index.html). errCode: para os dois casos cuja mensagem original embute
  // valores formatados por unidade (uT/uP) — o cliente já tem pin/T1 localmente
  // (leu via uBase antes do fetch) e recebe Tsat1/Tsat2 daqui para remontar o
  // texto EXATO com uT()/uP(), que continuam no index.html (não duplicados aqui).
  let err = null, errCode = null;
  if (pin <= pout) { err = "Pressão de entrada deve ser maior que a de saída."; errCode = 'p1_le_p2'; }
  else if (flow <= 0) { err = "Vazão deve ser maior que 0."; errCode = 'flow_le_0'; }
  else if (!(T1 > Tsat1)) { errCode = 'not_superheated'; }
  else if (T1 > 600) { errCode = 'temp_over_limit'; }
  const hasErr = !!errCode;

  const Ksh = hasErr ? 1 : khSup(pin, T1);
  const CVp = hasErr ? 0 : cvReq(pin, pout, flow) * Ksh;
  const kv = CVp * 0.865;
  const regime = (pin - pout < 0.42 * pin) ? "Subcrítico" : "Crítico";

  const models = [];
  if (!hasErr) {
    const list = Array.isArray(activeModels)
      ? activeModels.filter(m => VALV[m] && valveAbas(m).includes('vaporsup'))
      : modelsForTabAll('vaporsup');
    const _dpC = pin - pout;
    for (const modelo of list) {
      const md = VALV[modelo];
      if (!md) continue;
      const pmAdm = pmaxValv(modelo, Tsat1); // = pmaxValv(modelo, vaporTemp(pin))
      const excede = pmAdm != null && pin > pmAdm;
      const m = { modelo, pmAdm: (pmAdm == null ? null : pmAdm), excede, rows: [] };
      if (!excede) {
        m.rows = sortedSizes(md).map(([sz, cvv]) => {
          const Q = (flow / CVp) * cvv;
          const ab = aberturaFrac(modelo, sz, CVp, cvv);
          const _dm = (md.dpmax && md.dpmax[sz]);
          const dpOver = (_dm != null && _dm !== "" && _dpC > Number(_dm));
          return { sz, cvv, rcv: CVp / cvv, Q, ab, dpOver, dpm: (_dm == null || _dm === "") ? null : _dm };
        });
      }
      models.push(m);
    }
  }

  let vel = [];
  if (!hasErr) {
    const D = SCHED[sch] || SCHED['40'];
    const order = Object.keys(D).sort((a, b) => parseInch(a) - parseInch(b));
    // gás ideal: laminação isentálpica ~ isotérmica -> T~T1 nas duas pressões
    vel = order.map(sz => {
      const id = D[sz];
      const A = Math.PI / 4 * Math.pow(id / 1000, 2);
      const vin = (flow / 3600) * vaporVolSup(pin, T1) / A;
      const vout = (flow / 3600) * vaporVolSup(pout, T1) / A;
      return { sz, vin, vout };
    });
  }

  return { err, errCode, CVp, kv, regime, Tsat1, Tsat2, Ksh, models, vel };
}

/* ---------- computeReducAr: motor para renderReducAr (~linha 2822) ---------- */
export function computeReducAr({ pin, pout, flow, T1, sch, activeModels } = {}) {
  pin = Number(pin); pout = Number(pout); const Q = Number(flow); T1 = Number(T1);
  const unit = 'nm3h'; // igual ao index.html: aba de ar sempre usa Nm³/h internamente

  let err = null;
  if (pin <= pout) err = "Pressão de entrada deve ser maior que a de saída.";
  else if (Q <= 0) err = "Vazão deve ser maior que 0.";
  else if (isNaN(T1)) err = "Informe a temperatura de entrada.";
  const hasErr = !!err;

  const W = hasErr ? 0 : arWmass(Q, unit, pin, T1);
  const rho1 = arRho(pin, T1);
  const x = (pin - pout) / (pin + 1.01325);

  const models = [];
  if (!hasErr) {
    const list = Array.isArray(activeModels)
      ? activeModels.filter(m => VALV[m] && valveAbas(m).includes('ar'))
      : modelsForTabAll('ar');
    const _dpC = pin - pout;
    const T1eff = isNaN(T1) ? 20 : T1;
    for (const modelo of list) {
      const md = VALV[modelo];
      if (!md) continue;
      const pmAdm = pmaxValv(modelo, T1eff);
      const excede = pmAdm != null && pin > pmAdm;
      const m = { modelo, pmAdm: (pmAdm == null ? null : pmAdm), excede, rows: [] };
      if (!excede) {
        m.rows = sortedSizes(md).map(([sz, cvv]) => {
          const xt = arXt(modelo, sz);
          const CVp = cvReqAr(pin, pout, W, T1, xt);
          const Q2 = (Q / CVp) * cvv;
          const ab = aberturaFrac(modelo, sz, CVp, cvv);
          const _dm = (md.dpmax && md.dpmax[sz]);
          const dpOver = (_dm != null && _dm !== "" && _dpC > Number(_dm));
          return { sz, cvv, rcv: CVp / cvv, Q: Q2, ab, xt, cvp: CVp, dpOver, dpm: (_dm == null || _dm === "") ? null : _dm };
        });
      }
      models.push(m);
    }
  }

  let vel = [];
  if (!hasErr) {
    const D = SCHED[sch] || SCHED['40'];
    const order = Object.keys(D).sort((a, b) => parseInch(a) - parseInch(b));
    vel = order.map(sz => {
      const id = D[sz];
      const A = Math.PI / 4 * Math.pow(id / 1000, 2);
      const vin = (W / 3600) / arRho(pin, T1) / A;
      const vout = (W / 3600) / arRho(pout, T1) / A;
      return { sz, vin, vout };
    });
  }

  return { err, W, rho1, RHO_AR_N, x, models, vel };
}

/* ---------- computeReducAgua: motor para renderReducAgua (~linha 2998) ---------- */
export function computeReducAgua({ pin, pout, flow, T, sch, activeModels } = {}) {
  pin = Number(pin); pout = Number(pout); const fin = Number(flow); T = Number(T);

  let err = null, errCode = null;
  if (pin <= pout) { err = "Pressão de entrada deve ser maior que a de saída."; errCode = 'p1_le_p2'; }
  else if (fin <= 0) { err = "Vazão deve ser maior que 0."; errCode = 'flow_le_0'; }

  // bloqueio por temperatura de saturação (água permanece líquida)
  const Tsat1 = vaporTemp(pin), Tsat2 = vaporTemp(pout);
  let flashing = false;
  if (!err && !isNaN(T)) {
    if (T > Tsat1 + 0.05) { errCode = 'not_liquid'; }      // mensagem unit-dependente -> remontada no cliente
    else if (T > Tsat2 + 0.05) { flashing = true; }
  }
  const hasErr = !!(err || errCode);

  const rho = aguaRhoT(T);
  const Qv = hasErr ? 0 : aguaVol(fin, 'kg', T); // aguaUnit() no index.html sempre retorna 'kg'
  const CVp = hasErr ? 0 : cvReqAgua(pin, pout, Qv, T);
  const kv = CVp * 0.865;
  const regime = hasErr ? null : fluxoAgua(pin, pout);
  const dpChoked = aguaDpChoked(pin, T);

  const models = [];
  if (!hasErr) {
    const list = Array.isArray(activeModels)
      ? activeModels.filter(m => VALV[m] && valveAbas(m).includes('agua'))
      : modelsForTabAll('agua');
    const _dpC = pin - pout;
    for (const modelo of list) {
      const md = VALV[modelo];
      if (!md) continue;
      const pmAdm = pmaxValv(modelo, T);
      const excede = pmAdm != null && pin > pmAdm;
      const m = { modelo, pmAdm: (pmAdm == null ? null : pmAdm), excede, rows: [] };
      if (!excede) {
        m.rows = sortedSizes(md).map(([sz, cvv]) => {
          const Q = (fin / CVp) * cvv;
          const ab = aberturaFrac(modelo, sz, CVp, cvv);
          const _dm = (md.dpmax && md.dpmax[sz]);
          const dpOver = (_dm != null && _dm !== "" && _dpC > Number(_dm));
          return { sz, cvv, rcv: CVp / cvv, Q, ab, dpOver, dpm: (_dm == null || _dm === "") ? null : _dm };
        });
      }
      models.push(m);
    }
  }

  let vel = [];
  if (!hasErr) {
    const D = SCHED[sch] || SCHED['40'];
    const order = Object.keys(D).sort((a, b) => parseInch(a) - parseInch(b));
    vel = order.map(sz => {
      const A = Math.PI / 4 * Math.pow(D[sz] / 1000, 2);
      const v = (Qv / 3600) / A;
      return { sz, v };
    });
  }

  return { err, errCode, flashing, Tsat1, Tsat2, rho, Qv, CVp, kv, regime, dpChoked, models, vel };
}

/* ===================== PURGADORES (Seleção de Purgador) =====================
 * Fórmulas de capacidade por bitola armazenadas como texto ("curva") — no
 * cliente eram avaliadas com `new Function(...)` (eval). Aqui, um parser
 * recursivo (tokenizer -> AST -> avaliador) interpreta a mesma gramática
 * (números, variável x, + - * / **, parênteses) SEM eval/new Function. */
const PURG = [{"modelo": "PT61 - 4,5", "bitolas": [{"sz": "1/2", "dPMax_barg": 5.0, "curva": "-8.2282 * x ** 2 + 107.62 * x + 165.33"}, {"sz": "3/4", "dPMax_barg": 5.0, "curva": "-8.2282 * x ** 2 + 107.62 * x + 165.33"}, {"sz": "1", "dPMax_barg": 5.0, "curva": "-17.31 * x ** 2 + 246.79 * x + 435.31"}]}, {"modelo": "PT61 - 10", "bitolas": [{"sz": "1/2", "dPMax_barg": 11.0, "curva": "-0.1685 * x ** 2 + 33.539 * x + 114.47"}, {"sz": "3/4", "dPMax_barg": 11.0, "curva": "-0.1685 * x ** 2 + 33.539 * x + 114.47"}, {"sz": "1", "dPMax_barg": 11.0, "curva": "-5.0181 * x ** 2 + 110.4 * x + 206.67"}]}, {"modelo": "PT61 - 14", "bitolas": [{"sz": "1/2", "dPMax_barg": 15.0, "curva": "0.0172 * x ** 2 + 26.649 * x + 111.8"}, {"sz": "3/4", "dPMax_barg": 15.0, "curva": "0.0172 * x ** 2 + 26.649 * x + 111.8"}, {"sz": "1", "dPMax_barg": 15.0, "curva": "-1.6145 * x ** 2 + 49.689 * x + 117.07"}]}, {"modelo": "PT65 - 4,5", "bitolas": [{"sz": "1.1/2", "dPMax_barg": 5.0, "curva": "-0.0314 * x ** 2 + 508.89 * x + 2764.7"}, {"sz": "2", "dPMax_barg": 5.0, "curva": "-0.0314 * x ** 2 + 508.89 * x + 2764.7"}, {"sz": "1", "dPMax_barg": 5.0, "curva": "-0.0127 * x ** 2 + 208.01 * x + 736.79"}]}, {"modelo": "PT65 - 10", "bitolas": [{"sz": "1.1/2", "dPMax_barg": 11.0, "curva": "7.6824 * x ** 2 + 190.4 * x + 2404.9"}, {"sz": "2", "dPMax_barg": 11.0, "curva": "7.6824 * x ** 2 + 190.4 * x + 2404.9"}, {"sz": "1", "dPMax_barg": 11.0, "curva": "-0.1064 * x ** 2 + 106.45 * x + 549.46"}]}, {"modelo": "PT65 - 14", "bitolas": [{"sz": "1.1/2", "dPMax_barg": 15.0, "curva": "-1.7383 * x ** 2 + 245.27 * x + 2082.9"}, {"sz": "2", "dPMax_barg": 15.0, "curva": "-1.7383 * x ** 2 + 245.27 * x + 2082.9"}, {"sz": "1", "dPMax_barg": 15.0, "curva": "0.0448 * x ** 2 + 54.738 * x + 399.07"}]}, {"modelo": "PT66 - 4,5", "bitolas": [{"sz": "1.1/2", "dPMax_barg": 4.5, "curva": "-86.608 * x ** 4 + 869.68 * x ** 3 - 2915.9 * x ** 2 + 5980.8 * x + 3650.8"}, {"sz": "2", "dPMax_barg": 4.5, "curva": "-86.608 * x ** 4 + 869.68 * x ** 3 - 2915.9 * x ** 2 + 5980.8 * x + 3650.8"}]}, {"modelo": "PT66 - 10", "bitolas": [{"sz": "1.1/2", "dPMax_barg": 10.0, "curva": "-4.7165 * x ** 4 + 114.19 * x ** 3 - 942.33 * x ** 2 + 3987.9 * x + 2279.1"}, {"sz": "2", "dPMax_barg": 10.0, "curva": "-4.7165 * x ** 4 + 114.19 * x ** 3 - 942.33 * x ** 2 + 3987.9 * x + 2279.1"}]}, {"modelo": "PT66 - 14", "bitolas": [{"sz": "1.1/2", "dPMax_barg": 14.0, "curva": "-0.7443 * x ** 4 + 25.663 * x ** 3 - 301.32 * x ** 2 + 1936.5 * x + 1705.6"}, {"sz": "2", "dPMax_barg": 14.0, "curva": "-0.7443 * x ** 4 + 25.663 * x ** 3 - 301.32 * x ** 2 + 1936.5 * x + 1705.6"}]}, {"modelo": "FTV 120", "bitolas": [{"sz": "2.1/2", "dPMax_barg": 12.3, "curva": "-251.15 * (x) ** 2 + 5079.5 * (x) + 24214"}, {"sz": "3", "dPMax_barg": 12.3, "curva": "-251.15 * (x) ** 2 + 5079.5 * (x) + 24214"}, {"sz": "2", "dPMax_barg": 12.3, "curva": "-118.37 * (x) ** 2 + 2468.1 * (x) + 10790"}]}, {"modelo": "UNA14 - 4", "bitolas": [{"sz": "1/2", "dPMax_barg": 4.0, "curva": "-33.721 * (x) ** 2 + 239.09 * (x) + 184.08"}, {"sz": "3/4", "dPMax_barg": 4.0, "curva": "-33.721 * (x) ** 2 + 239.09 * (x) + 184.08"}, {"sz": "1", "dPMax_barg": 4.0, "curva": "-33.721 * (x) ** 2 + 239.09 * (x) + 184.08"}]}, {"modelo": "UNA14 - 13", "bitolas": [{"sz": "1/2", "dPMax_barg": 13.0, "curva": "-3.3778 * (x) ** 2 + 78.2 * (x) + 150.16"}, {"sz": "3/4", "dPMax_barg": 13.0, "curva": "-3.3778 * (x) ** 2 + 78.2 * (x) + 150.16"}, {"sz": "1", "dPMax_barg": 13.0, "curva": "-3.3778 * (x) ** 2 + 78.2 * (x) + 150.16"}]}, {"modelo": "UNA16 - 4", "bitolas": [{"sz": "1/2", "dPMax_barg": 4.0, "curva": "-33.721 * (x) ** 2 + 239.09 * (x) + 184.08"}, {"sz": "3/4", "dPMax_barg": 4.0, "curva": "-33.721 * (x) ** 2 + 239.09 * (x) + 184.08"}, {"sz": "1", "dPMax_barg": 4.0, "curva": "-33.721 * (x) ** 2 + 239.09 * (x) + 184.08"}]}, {"modelo": "UNA16 - 13", "bitolas": [{"sz": "1/2", "dPMax_barg": 13.0, "curva": "-3.3778 * (x) ** 2 + 78.2 * (x) + 150.16"}, {"sz": "3/4", "dPMax_barg": 13.0, "curva": "-3.3778 * (x) ** 2 + 78.2 * (x) + 150.16"}, {"sz": "1", "dPMax_barg": 13.0, "curva": "-3.3778 * (x) ** 2 + 78.2 * (x) + 150.16"}]}, {"modelo": "UNA16 - 22", "bitolas": [{"sz": "1/2", "dPMax_barg": 22.0, "curva": "-1.3978 * (x) ** 2 + 52.24 * (x) + 119.62"}, {"sz": "3/4", "dPMax_barg": 22.0, "curva": "-1.3978 * (x) ** 2 + 52.24 * (x) + 119.62"}, {"sz": "1", "dPMax_barg": 22.0, "curva": "-1.3978 * (x) ** 2 + 52.24 * (x) + 119.62"}]}, {"modelo": "UNA4 - 4", "bitolas": [{"sz": "1/2", "dPMax_barg": 4.0, "curva": "-66.792 * (x) ** 2 + 513.58 * (x) + 292.92"}, {"sz": "3/4", "dPMax_barg": 4.0, "curva": "-66.792 * (x) ** 2 + 513.58 * (x) + 292.92"}, {"sz": "1", "dPMax_barg": 4.0, "curva": "-66.792 * (x) ** 2 + 513.58 * (x) + 292.92"}, {"sz": "1.1/2", "dPMax_barg": 4.0, "curva": "-182.82 * (x) ** 2 + 1660.5 * (x) + 1774.4"}, {"sz": "2", "dPMax_barg": 4.0, "curva": "-182.82 * (x) ** 2 + 1660.5 * (x) + 1774.4"}]}, {"modelo": "UNA4 - 8", "bitolas": [{"sz": "1/2", "dPMax_barg": 8.0, "curva": "-7.8426 * (x) ** 2 + 180.44 * (x) + 234.18"}, {"sz": "3/4", "dPMax_barg": 8.0, "curva": "-7.8426 * (x) ** 2 + 180.44 * (x) + 234.18"}, {"sz": "1", "dPMax_barg": 8.0, "curva": "-7.8426 * (x) ** 2 + 180.44 * (x) + 234.18"}, {"sz": "1.1/2", "dPMax_barg": 8.0, "curva": "-59.307 * (x) ** 2 + 943.51 * (x) + 1284.4"}, {"sz": "2", "dPMax_barg": 8.0, "curva": "-59.307 * (x) ** 2 + 943.51 * (x) + 1284.4"}]}, {"modelo": "UNA4 - 13", "bitolas": [{"sz": "1/2", "dPMax_barg": 13.0, "curva": "-6.3552 * (x) ** 2 + 128.42 * (x) + 213.5"}, {"sz": "3/4", "dPMax_barg": 13.0, "curva": "-6.3552 * (x) ** 2 + 128.42 * (x) + 213.5"}, {"sz": "1", "dPMax_barg": 13.0, "curva": "-6.3552 * (x) ** 2 + 128.42 * (x) + 213.5"}, {"sz": "1.1/2", "dPMax_barg": 13.0, "curva": "-32.111 * (x) ** 2 + 637.05 * (x) + 1014.8"}, {"sz": "2", "dPMax_barg": 13.0, "curva": "-32.111 * (x) ** 2 + 637.05 * (x) + 1014.8"}]}, {"modelo": "UNA4 - 22", "bitolas": [{"sz": "1/2", "dPMax_barg": 22.0, "curva": "-2.4858 * (x) ** 2 + 83.934 * (x) + 206.46"}, {"sz": "3/4", "dPMax_barg": 22.0, "curva": "-2.4858 * (x) ** 2 + 83.934 * (x) + 206.46"}, {"sz": "1", "dPMax_barg": 22.0, "curva": "-2.4858 * (x) ** 2 + 83.934 * (x) + 206.46"}, {"sz": "1.1/2", "dPMax_barg": 22.0, "curva": "-10.49 * (x) ** 2 + 371.73 * (x) + 809.78"}, {"sz": "2", "dPMax_barg": 22.0, "curva": "-10.49 * (x) ** 2 + 371.73 * (x) + 809.78"}]}, {"modelo": "UNA4 - 32", "bitolas": [{"sz": "1/2", "dPMax_barg": 32.0, "curva": "-0.8581 * (x) ** 2 + 45.383 * (x) + 202.03"}, {"sz": "3/4", "dPMax_barg": 32.0, "curva": "-0.8581 * (x) ** 2 + 45.383 * (x) + 202.03"}, {"sz": "1", "dPMax_barg": 32.0, "curva": "-0.8581 * (x) ** 2 + 45.383 * (x) + 202.03"}, {"sz": "1.1/2", "dPMax_barg": 32.0, "curva": "-4.3124 * (x) ** 2 + 245.23 * (x) + 727.89"}, {"sz": "2", "dPMax_barg": 32.0, "curva": "-4.3124 * (x) ** 2 + 245.23 * (x) + 727.89"}]}, {"modelo": "UNA4 - 4 MAX", "bitolas": [{"sz": "1.1/2", "dPMax_barg": 4.0, "curva": "-969.19 * (x) ** 2 + 6186.2 * (x) + 5393.4"}, {"sz": "2", "dPMax_barg": 4.0, "curva": "-969.19 * (x) ** 2 + 6186.2 * (x) + 5393.4"}, {"sz": "1", "dPMax_barg": 4.0, "curva": "-969.19 * (x) ** 2 + 6186.2 * (x) + 5393.4"}]}, {"modelo": "UNA4 - 8 MAX", "bitolas": [{"sz": "1.1/2", "dPMax_barg": 8.0, "curva": "-261.11 * (x) ** 2 + 3384 * (x) + 3690.5"}, {"sz": "2", "dPMax_barg": 8.0, "curva": "-261.11 * (x) ** 2 + 3384 * (x) + 3690.5"}, {"sz": "1", "dPMax_barg": 8.0, "curva": "-261.11 * (x) ** 2 + 3384 * (x) + 3690.5"}]}, {"modelo": "UNA4 - 13 MAX", "bitolas": [{"sz": "1.1/2", "dPMax_barg": 13.0, "curva": "-70.537 * (x) ** 2 + 1829.9 * (x) + 2779.8"}, {"sz": "2", "dPMax_barg": 13.0, "curva": "-70.537 * (x) ** 2 + 1829.9 * (x) + 2779.8"}, {"sz": "1", "dPMax_barg": 13.0, "curva": "-70.537 * (x) ** 2 + 1829.9 * (x) + 2779.8"}]}, {"modelo": "UNA4 - 22 MAX", "bitolas": [{"sz": "1.1/2", "dPMax_barg": 22.0, "curva": "-13.274 * (x) ** 2 + 804.42 * (x) + 1843.1"}, {"sz": "2", "dPMax_barg": 22.0, "curva": "-13.274 * (x) ** 2 + 804.42 * (x) + 1843.1"}, {"sz": "1", "dPMax_barg": 22.0, "curva": "-13.274 * (x) ** 2 + 804.42 * (x) + 1843.1"}]}, {"modelo": "UNA4 - 32 MAX", "bitolas": [{"sz": "1.1/2", "dPMax_barg": 32.0, "curva": "-8.7867 * (x) ** 2 + 520.32 * (x) + 1647.1"}, {"sz": "2", "dPMax_barg": 32.0, "curva": "-8.7867 * (x) ** 2 + 520.32 * (x) + 1647.1"}, {"sz": "1", "dPMax_barg": 32.0, "curva": "-8.7867 * (x) ** 2 + 520.32 * (x) + 1647.1"}]}, {"modelo": "UNA25 - 4", "bitolas": [{"sz": "1/2", "dPMax_barg": 4.0, "curva": "-48.274 * (x) ** 2 + 454.2 * (x) + 322.88"}, {"sz": "3/4", "dPMax_barg": 4.0, "curva": "-48.274 * (x) ** 2 + 454.2 * (x) + 322.88"}, {"sz": "1", "dPMax_barg": 4.0, "curva": "-48.274 * (x) ** 2 + 454.2 * (x) + 322.88"}, {"sz": "1.1/2", "dPMax_barg": 4.0, "curva": "-243.78 * (x) ** 2 + 1752.8 * (x) + 1929.5"}, {"sz": "2", "dPMax_barg": 4.0, "curva": "-243.78 * (x) ** 2 + 1752.8 * (x) + 1929.5"}]}, {"modelo": "UNA26 - 4", "bitolas": [{"sz": "1/2", "dPMax_barg": 4.0, "curva": "-48.274 * (x) ** 2 + 454.2 * (x) + 322.88"}, {"sz": "3/4", "dPMax_barg": 4.0, "curva": "-48.274 * (x) ** 2 + 454.2 * (x) + 322.88"}, {"sz": "1", "dPMax_barg": 4.0, "curva": "-48.274 * (x) ** 2 + 454.2 * (x) + 322.88"}, {"sz": "1.1/2", "dPMax_barg": 4.0, "curva": "-243.78 * (x) ** 2 + 1752.8 * (x) + 1929.5"}, {"sz": "2", "dPMax_barg": 4.0, "curva": "-243.78 * (x) ** 2 + 1752.8 * (x) + 1929.5"}]}, {"modelo": "UNA23 - 8", "bitolas": [{"sz": "1/2", "dPMax_barg": 8.0, "curva": "-16.091 * (x) ** 2 + 232.15 * (x) + 240.34"}, {"sz": "3/4", "dPMax_barg": 8.0, "curva": "-16.091 * (x) ** 2 + 232.15 * (x) + 240.34"}, {"sz": "1", "dPMax_barg": 8.0, "curva": "-16.091 * (x) ** 2 + 232.15 * (x) + 240.34"}, {"sz": "1.1/2", "dPMax_barg": 8.0, "curva": "-70.871 * (x) ** 2 + 996.72 * (x) + 1590.2"}, {"sz": "2", "dPMax_barg": 8.0, "curva": "-70.871 * (x) ** 2 + 996.72 * (x) + 1590.2"}]}, {"modelo": "UNA25 - 8", "bitolas": [{"sz": "1/2", "dPMax_barg": 8.0, "curva": "-16.091 * (x) ** 2 + 232.15 * (x) + 240.34"}, {"sz": "3/4", "dPMax_barg": 8.0, "curva": "-16.091 * (x) ** 2 + 232.15 * (x) + 240.34"}, {"sz": "1", "dPMax_barg": 8.0, "curva": "-16.091 * (x) ** 2 + 232.15 * (x) + 240.34"}, {"sz": "1.1/2", "dPMax_barg": 8.0, "curva": "-70.871 * (x) ** 2 + 996.72 * (x) + 1590.2"}, {"sz": "2", "dPMax_barg": 8.0, "curva": "-70.871 * (x) ** 2 + 996.72 * (x) + 1590.2"}]}, {"modelo": "UNA26 - 8", "bitolas": [{"sz": "1/2", "dPMax_barg": 8.0, "curva": "-16.091 * (x) ** 2 + 232.15 * (x) + 240.34"}, {"sz": "3/4", "dPMax_barg": 8.0, "curva": "-16.091 * (x) ** 2 + 232.15 * (x) + 240.34"}, {"sz": "1", "dPMax_barg": 8.0, "curva": "-16.091 * (x) ** 2 + 232.15 * (x) + 240.34"}, {"sz": "1.1/2", "dPMax_barg": 8.0, "curva": "-70.871 * (x) ** 2 + 996.72 * (x) + 1590.2"}, {"sz": "2", "dPMax_barg": 8.0, "curva": "-70.871 * (x) ** 2 + 996.72 * (x) + 1590.2"}]}, {"modelo": "UNA23 - 13", "bitolas": [{"sz": "1/2", "dPMax_barg": 13.0, "curva": "-4.8461 * (x) ** 2 + 119.58 * (x) + 222.32"}, {"sz": "3/4", "dPMax_barg": 13.0, "curva": "-4.8461 * (x) ** 2 + 119.58 * (x) + 222.32"}, {"sz": "1", "dPMax_barg": 13.0, "curva": "-4.8461 * (x) ** 2 + 119.58 * (x) + 222.32"}, {"sz": "1.1/2", "dPMax_barg": 13.0, "curva": "-25.293 * (x) ** 2 + 557.6 * (x) + 1033.5"}, {"sz": "2", "dPMax_barg": 13.0, "curva": "-25.293 * (x) ** 2 + 557.6 * (x) + 1033.5"}]}, {"modelo": "UNA25 - 13", "bitolas": [{"sz": "1/2", "dPMax_barg": 13.0, "curva": "-4.8461 * (x) ** 2 + 119.58 * (x) + 222.32"}, {"sz": "3/4", "dPMax_barg": 13.0, "curva": "-4.8461 * (x) ** 2 + 119.58 * (x) + 222.32"}, {"sz": "1", "dPMax_barg": 13.0, "curva": "-4.8461 * (x) ** 2 + 119.58 * (x) + 222.32"}, {"sz": "1.1/2", "dPMax_barg": 13.0, "curva": "-25.293 * (x) ** 2 + 557.6 * (x) + 1033.5"}, {"sz": "2", "dPMax_barg": 13.0, "curva": "-25.293 * (x) ** 2 + 557.6 * (x) + 1033.5"}]}, {"modelo": "UNA26 - 13", "bitolas": [{"sz": "1/2", "dPMax_barg": 13.0, "curva": "-4.8461 * (x) ** 2 + 119.58 * (x) + 222.32"}, {"sz": "3/4", "dPMax_barg": 13.0, "curva": "-4.8461 * (x) ** 2 + 119.58 * (x) + 222.32"}, {"sz": "1", "dPMax_barg": 13.0, "curva": "-4.8461 * (x) ** 2 + 119.58 * (x) + 222.32"}, {"sz": "1.1/2", "dPMax_barg": 13.0, "curva": "-25.293 * (x) ** 2 + 557.6 * (x) + 1033.5"}, {"sz": "2", "dPMax_barg": 13.0, "curva": "-25.293 * (x) ** 2 + 557.6 * (x) + 1033.5"}]}, {"modelo": "UNA25 - 22", "bitolas": [{"sz": "1/2", "dPMax_barg": 22.0, "curva": "-1.8316 * (x) ** 2 + 70.656 * (x) + 207.77"}, {"sz": "3/4", "dPMax_barg": 22.0, "curva": "-1.8316 * (x) ** 2 + 70.656 * (x) + 207.77"}, {"sz": "1", "dPMax_barg": 22.0, "curva": "-1.8316 * (x) ** 2 + 70.656 * (x) + 207.77"}, {"sz": "1.1/2", "dPMax_barg": 22.0, "curva": "-8.6832 * (x) ** 2 + 329.9 * (x) + 818.22"}, {"sz": "2", "dPMax_barg": 22.0, "curva": "-8.6832 * (x) ** 2 + 329.9 * (x) + 818.22"}]}, {"modelo": "UNA26 - 22", "bitolas": [{"sz": "1/2", "dPMax_barg": 22.0, "curva": "-1.8316 * (x) ** 2 + 70.656 * (x) + 207.77"}, {"sz": "3/4", "dPMax_barg": 22.0, "curva": "-1.8316 * (x) ** 2 + 70.656 * (x) + 207.77"}, {"sz": "1", "dPMax_barg": 22.0, "curva": "-1.8316 * (x) ** 2 + 70.656 * (x) + 207.77"}, {"sz": "1.1/2", "dPMax_barg": 22.0, "curva": "-8.6832 * (x) ** 2 + 329.9 * (x) + 818.22"}, {"sz": "2", "dPMax_barg": 22.0, "curva": "-8.6832 * (x) ** 2 + 329.9 * (x) + 818.22"}]}, {"modelo": "UNA25 - 32", "bitolas": [{"sz": "1/2", "dPMax_barg": 32.0, "curva": "-0.7584 * (x) ** 2 + 40.655 * (x) + 192.28"}, {"sz": "3/4", "dPMax_barg": 32.0, "curva": "-0.7584 * (x) ** 2 + 40.655 * (x) + 192.28"}, {"sz": "1", "dPMax_barg": 32.0, "curva": "-0.7584 * (x) ** 2 + 40.655 * (x) + 192.28"}, {"sz": "1.1/2", "dPMax_barg": 32.0, "curva": "-3.2351 * (x) ** 2 + 194.73 * (x) + 666.33"}, {"sz": "2", "dPMax_barg": 32.0, "curva": "-3.2351 * (x) ** 2 + 194.73 * (x) + 666.33"}]}, {"modelo": "UNA26 - 32", "bitolas": [{"sz": "1/2", "dPMax_barg": 32.0, "curva": "-0.7584 * (x) ** 2 + 40.655 * (x) + 192.28"}, {"sz": "3/4", "dPMax_barg": 32.0, "curva": "-0.7584 * (x) ** 2 + 40.655 * (x) + 192.28"}, {"sz": "1", "dPMax_barg": 32.0, "curva": "-0.7584 * (x) ** 2 + 40.655 * (x) + 192.28"}, {"sz": "1.1/2", "dPMax_barg": 32.0, "curva": "-3.2351 * (x) ** 2 + 194.73 * (x) + 666.33"}, {"sz": "2", "dPMax_barg": 32.0, "curva": "-3.2351 * (x) ** 2 + 194.73 * (x) + 666.33"}]}, {"modelo": "UNA25PK - 6", "bitolas": [{"sz": "1.1/2", "dPMax_barg": 6.0, "curva": "-93.044 * (x) ** 2 + 1040.2 * (x) + 620.86"}]}, {"modelo": "UNA25PK - 13", "bitolas": [{"sz": "1.1/2", "dPMax_barg": 13.0, "curva": "-24.567 * (x) ** 2 + 470 * (x) + 739.97"}]}, {"modelo": "42.634 - 14", "bitolas": [{"sz": "1/2", "dPMax_barg": 12.0, "curva": "-1.4958 * (x) ** 2 + 47.461 * (x) + 225.57"}, {"sz": "3/4", "dPMax_barg": 12.0, "curva": "-1.4958 * (x) ** 2 + 47.461 * (x) + 225.57"}, {"sz": "1", "dPMax_barg": 12.0, "curva": "-1.4958 * (x) ** 2 + 47.461 * (x) + 225.57"}]}, {"modelo": "42.634 - 4", "bitolas": [{"sz": "1/2", "dPMax_barg": 4.0, "curva": "-24.055 * (x) ** 2 + 196.48 * (x) + 187.58"}, {"sz": "3/4", "dPMax_barg": 4.0, "curva": "-24.055 * (x) ** 2 + 196.48 * (x) + 187.58"}, {"sz": "1", "dPMax_barg": 4.0, "curva": "-24.055 * (x) ** 2 + 196.48 * (x) + 187.58"}]}, {"modelo": "12.635 - 5", "bitolas": [{"sz": "1", "dPMax_barg": 5.0, "curva": "-43.433 * (x) ** 2 + 610.24 * (x) + 611.16"}]}, {"modelo": "12.635 - 10", "bitolas": [{"sz": "1", "dPMax_barg": 10.0, "curva": "-7.6227 * (x) ** 2 + 210.24 * (x) + 441.62"}]}, {"modelo": "12.635 - 14", "bitolas": [{"sz": "1", "dPMax_barg": 12.0, "curva": "-4.3511 * (x) ** 2 + 138.04 * (x) + 351.53"}]}, {"modelo": "12.631 - 4", "bitolas": [{"sz": "1.1/2", "dPMax_barg": 4.0, "curva": "-87.848 * (x) ** 2 + 972.52 * (x) + 988.14"}, {"sz": "2", "dPMax_barg": 4.0, "curva": "-87.848 * (x) ** 2 + 972.52 * (x) + 988.14"}]}, {"modelo": "12.631 - 8", "bitolas": [{"sz": "1.1/2", "dPMax_barg": 8.0, "curva": "-21.884 * (x) ** 2 + 488.86 * (x) + 962.62"}, {"sz": "2", "dPMax_barg": 8.0, "curva": "-21.884 * (x) ** 2 + 488.86 * (x) + 962.62"}]}, {"modelo": "12.631 - 13", "bitolas": [{"sz": "1.1/2", "dPMax_barg": 12.0, "curva": "-8.298 * (x) ** 2 + 249.31 * (x) + 896.05"}, {"sz": "2", "dPMax_barg": 12.0, "curva": "-8.298 * (x) ** 2 + 249.31 * (x) + 896.05"}]}, {"modelo": "PT11", "bitolas": [{"sz": "1/2", "dPMax_barg": 42.0, "curva": "-0.3535 * x ** 2 + 26.794 * x + 206.51"}, {"sz": "3/4", "dPMax_barg": 42.0, "curva": "-0.3535 * x ** 2 + 26.794 * x + 206.51"}, {"sz": "1", "dPMax_barg": 42.0, "curva": "-0.4483 * x ** 2 + 38.356 * x + 223.21"}]}, {"modelo": "PT15", "bitolas": [{"sz": "1", "dPMax_barg": 42.0, "curva": "-0.9903 * x ** 2 + 67.87 * x + 1063.5"}]}, {"modelo": "PT16", "bitolas": [{"sz": "3/4", "dPMax_barg": 42.0, "curva": "-0.377 * x ** 2 + 29.549 * x + 156.96"}, {"sz": "1", "dPMax_barg": 42.0, "curva": "-0.5133 * x ** 2 + 44.609 * x + 158.71"}]}, {"modelo": "55641", "bitolas": [{"sz": "1/2", "dPMax_barg": 32.0, "curva": "-0.2165 * x ** 2 + 22.431 * x + 139.36"}, {"sz": "3/4", "dPMax_barg": 32.0, "curva": "-0.5874 * x ** 2 + 42.359 * x + 291.14"}, {"sz": "1", "dPMax_barg": 32.0, "curva": "-0.6445 * x ** 2 + 63.358 * x + 490.1"}]}, {"modelo": "BK45", "bitolas": [{"sz": "1/2", "dPMax_barg": 22.0, "curva": "154.2 * ((x) ** 0.401)"}, {"sz": "1", "dPMax_barg": 22.0, "curva": "154.2 * ((x) ** 0.401)"}]}, {"modelo": "BK46", "bitolas": [{"sz": "1/2", "dPMax_barg": 32.0, "curva": "154.2 * ((x) ** 0.401)"}, {"sz": "1", "dPMax_barg": 32.0, "curva": "154.2 * ((x) ** 0.401)"}]}, {"modelo": "BK15", "bitolas": [{"sz": "1.1/2", "dPMax_barg": 22.0, "curva": "(441.32 * ((-0.0073 * ((x) ** 2)) + ((0.2855 * (x)) - 0.1795))) + 899.63"}, {"sz": "2", "dPMax_barg": 22.0, "curva": "(441.32 * ((-0.0073 * ((x) ** 2)) + ((0.2855 * (x)) - 0.1795))) + 899.63"}]}, {"modelo": "45601", "bitolas": [{"sz": "1/2", "dPMax_barg": 32.0, "curva": "-0.4436 * ((x) ** 2) + 70.446 * (x) + 53.839"}, {"sz": "3/4", "dPMax_barg": 32.0, "curva": "-0.4436 * ((x) ** 2) + 70.446 * (x) + 53.839"}, {"sz": "1", "dPMax_barg": 32.0, "curva": "-0.4436 * ((x) ** 2) + 70.446 * (x) + 53.839"}]}, {"modelo": "MK35/31", "bitolas": [{"sz": "3/8", "dPMax_barg": 21.0, "curva": "-0.9419 * ((x) ** 2) + 37.755 * (x) + 13.847"}, {"sz": "1/2", "dPMax_barg": 21.0, "curva": "-0.9419 * ((x) ** 2) + 37.755 * (x) + 13.847"}]}, {"modelo": "MK35/32", "bitolas": [{"sz": "1", "dPMax_barg": 21.0, "curva": "-2.2573 * ((x) ** 2) + 76.448 * (x) + 181.89"}]}, {"modelo": "MK36/51", "bitolas": [{"sz": "3/8", "dPMax_barg": 32.0, "curva": "-0.5741 * (x) ** 2 + 31.982 * (x) + 75.095"}, {"sz": "1/2", "dPMax_barg": 32.0, "curva": "-0.5741 * (x) ** 2 + 31.982 * (x) + 75.095"}, {"sz": "1", "dPMax_barg": 32.0, "curva": "-0.5741 * (x) ** 2 + 31.982 * (x) + 75.095"}]}, {"modelo": "55614", "bitolas": [{"sz": "1/2", "dPMax_barg": 32.0, "curva": "-1.0202 * ((x) ** 2) + 62.313 * (x) + 186.62"}]}, {"modelo": "45613", "bitolas": [{"sz": "1/2", "dPMax_barg": 32.0, "curva": "-0.9519 * ((x) ** 2) + 60.949 * (x) + 192.4"}, {"sz": "3/4", "dPMax_barg": 32.0, "curva": "-0.9519 * ((x) ** 2) + 60.949 * (x) + 192.4"}, {"sz": "1", "dPMax_barg": 32.0, "curva": "-0.9519 * ((x) ** 2) + 60.949 * (x) + 192.4"}, {"sz": "", "dPMax_barg": 32.0, "curva": "0"}]}];

function purgTokenize(expr) {
  const toks = [];
  const s = String(expr);
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '(' || c === ')') { toks.push({ t: c }); i++; continue; }
    if (c === '+' || c === '-') { toks.push({ t: c }); i++; continue; }
    if (c === '*') {
      if (s[i + 1] === '*') { toks.push({ t: '**' }); i += 2; }
      else { toks.push({ t: '*' }); i++; }
      continue;
    }
    if (c === '/') { toks.push({ t: '/' }); i++; continue; }
    if (c === 'x' || c === 'X') { toks.push({ t: 'x' }); i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const num = parseFloat(s.slice(i, j));
      if (isNaN(num)) throw new Error('purgFnSafe: número inválido na expressão "' + expr + '"');
      toks.push({ t: 'num', v: num });
      i = j;
      continue;
    }
    throw new Error('purgFnSafe: caractere inesperado "' + c + '" na expressão "' + expr + '"');
  }
  return toks;
}

function purgParse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  function parseExpr() {
    let node = parseTerm();
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = next().t;
      node = { type: 'bin', op, l: node, r: parseTerm() };
    }
    return node;
  }
  function parseTerm() {
    let node = parsePow();
    while (peek() && (peek().t === '*' || peek().t === '/')) {
      const op = next().t;
      node = { type: 'bin', op, l: node, r: parsePow() };
    }
    return node;
  }
  function parsePow() {
    const node = parseUnary();
    if (peek() && peek().t === '**') {
      next();
      return { type: 'bin', op: '**', l: node, r: parsePow() }; // right-assoc
    }
    return node;
  }
  function parseUnary() {
    if (peek() && peek().t === '-') { next(); return { type: 'neg', v: parseUnary() }; }
    if (peek() && peek().t === '+') { next(); return parseUnary(); }
    return parsePrimary();
  }
  function parsePrimary() {
    const tok = peek();
    if (!tok) throw new Error('purgFnSafe: expressão incompleta');
    if (tok.t === 'num') { next(); return { type: 'num', v: tok.v }; }
    if (tok.t === 'x') { next(); return { type: 'var' }; }
    if (tok.t === '(') {
      next();
      const node = parseExpr();
      if (!peek() || peek().t !== ')') throw new Error('purgFnSafe: parêntese não fechado');
      next();
      return node;
    }
    throw new Error('purgFnSafe: token inesperado na expressão');
  }
  const ast = parseExpr();
  if (pos !== tokens.length) throw new Error('purgFnSafe: tokens residuais na expressão');
  return ast;
}

function purgEvalAst(node, x) {
  switch (node.type) {
    case 'num': return node.v;
    case 'var': return x;
    case 'neg': return -purgEvalAst(node.v, x);
    case 'bin': {
      const l = purgEvalAst(node.l, x), r = purgEvalAst(node.r, x);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '**': return Math.pow(l, r);
      }
    }
  }
  throw new Error('purgFnSafe: nó AST inválido');
}

const _purgCache = {};
function purgFnSafe(expr) {
  if (!_purgCache[expr]) {
    const ast = purgParse(purgTokenize(expr));
    _purgCache[expr] = (x) => purgEvalAst(ast, x);
  }
  return _purgCache[expr];
}

// computePurg: núcleo puro (sem DOM). Agrupamento por família (PFAM), filtro
// de modelos ativos (isAtivo) e montagem de HTML continuam no cliente — aqui
// só devolvemos, para CADA modelo/bitola do catálogo PURG, os números já
// calculados (equivalentes a purgRows no index.html).
function computePurg(inputs = {}) {
  const pin = Number(inputs.pin);
  const pout = Number(inputs.pout);
  const dp = Math.max(pin - pout, 0);
  const flow = Number(inputs.flow) || 0; // vazão necessária [kg/h]
  const fsReq = Number(inputs.fsReq) || 0;
  const Tcond = vaporTemp(pin);

  const models = PURG.map(m => {
    const bitolas = (m.bitolas || []).map(b => {
      const acima = pin > b.dPMax_barg;
      const cap = (acima || !b.curva) ? 0 : Math.max(purgFnSafe(b.curva)(dp), 0);
      const fs = flow > 0 ? cap / flow : 0;
      const trava = acima || cap < flow;
      const okFS = !trava && fs >= fsReq;
      return { sz: b.sz || '', dPMax_barg: b.dPMax_barg, acima, cap, fs, trava, okFS };
    });
    return { modelo: m.modelo, bitolas };
  });

  return { dp, Tcond, flow, fsReq, models };
}

/* ===================== VÁLVULA DE ALÍVIO / SEGURANÇA (PSV) =====================
 * Núcleo puro DIN (kdr) + ANSI (ASME VIII / API 520) + bronze (tabela MIPEL).
 * Verbatim do index.html (calcValv/calcValvANSI/brzCapKgh/calcBronze). O
 * resultado numérico das linhas NÃO depende do modelo/catálogo escolhido
 * (25.911 vs 35.911 etc.) — só do fluido — então o servidor calcula um único
 * conjunto de linhas por engine (DIN/ANSI/bronze) e o cliente decide quais
 * "cards" mostrar (isAtivo, modelos ativos), sem precisar reenviar isso ao
 * servidor. */
function kdrLineVapor(setP) {
  const kv = ENG.valvSeg.kdr_vapor; let lin = null, ex = false;
  for (let i = 0; i < 19; i++) if (kv[i][0] === setP) { ex = true; lin = i + 1; }
  if (setP >= 3.5) { lin = 17; ex = true; } if (setP >= 4) { lin = 19; ex = true; }
  if (!ex) { const b = [[0.2,0.3,1],[0.3,0.4,2],[0.4,0.5,3],[0.5,0.6,4],[0.6,0.7,5],[0.7,0.8,6],[0.8,0.9,7],[0.9,1,8],[1,1.2,9],[1.2,1.5,10],[1.5,1.6,11],[1.6,1.8,12],[1.8,2,13],[2,2.5,14],[2.5,3,15],[3,3.5,16]];
    for (const [a, z, L] of b) if (setP > a && setP < z) lin = L; }
  return { lin, ex };
}
function colSeqVapor() { let c = 2; const s = []; for (let r = 1; r <= 16; r++) { if ((r === 2) !== (r === 10) !== (r > 11)) c++; s.push(c); } return s; }
function colSeqAgua() { let c = 1; const s = []; for (let r = 1; r <= 16; r++) { if ((r === 2) !== (r === 7) !== (r === 10) !== (r > 11)) c++; s.push(c); } return s; }
function calcValv(media, setP, flow, op, backP, tAgua) {
  const k = ENG.valvSeg.k_vapor, P0 = setP * (1 + op / 100) + ATM, Pa = backP + ATM;
  const A0 = ENG.valvSeg.A0_mm2, bocal = ENG.valvSeg.bocal, out = [];
  if (media === "Vapor Saturado") {
    const v = vaporVol(P0 - 1.0), { lin, ex } = kdrLineVapor(setP), kv = ENG.valvSeg.kdr_vapor;
    const crit = Math.pow(2 / (k + 1), k / (k - 1));
    let psi = Pa / P0 <= crit ? Math.sqrt(k / (k + 1)) * Math.pow(2 / (k + 1), 1 / (k - 1)) : Math.sqrt(k / (k + 1)) * Math.sqrt(Math.pow(Pa / P0, 2 / k) - Math.pow(Pa / P0, (k + 1) / k));
    const x = 0.6211 * (Math.sqrt(P0 * v) / psi), seq = colSeqVapor();
    for (let r = 1; r <= 16; r++) { const col = seq[r - 1]; let KDR = ex ? kv[lin - 1][col - 1] : kv[lin - 1][col - 1] + (setP - kv[lin - 1][0]) * (kv[lin][col - 1] - kv[lin - 1][col - 1]) / (kv[lin][0] - kv[lin - 1][0]);
      if (r > 13 && col > 6 && col < 9 && lin === 1) { out.push({ bocal: bocal[r - 1], W0: null, fs: null, A0: A0[r - 1] }); continue; }
      const W0 = KDR * P0 * A0[r - 1] / x; out.push({ bocal: bocal[r - 1], W0, fs: (W0 - flow) / flow, A0: A0[r - 1] }); }
  } else {
    const rho = aguaRho(tAgua), lin = setP >= 0.3 ? 2 : 1, seq = colSeqAgua(); let c943 = 0;
    for (let r = 1; r <= 16; r++) { let KDR; if (r < 14) KDR = ENG.valvSeg.kdr_agua_911[seq[r - 1] - 1]; else { c943++; KDR = ENG.valvSeg.kdr_agua_943[lin - 1][c943 - 1]; }
      if (r > 13 && c943 < 3 && lin === 1) { out.push({ bocal: bocal[r - 1], W0: null, fs: null, A0: A0[r - 1] }); continue; }
      const W0 = A0[r - 1] * KDR * Math.sqrt((P0 - Pa) * rho) / 0.6211; out.push({ bocal: bocal[r - 1], W0, fs: (W0 - flow) / flow, A0: A0[r - 1] }); }
  }
  return out;
}

const ANSI_NPS = ['1"x2"', '1 1/2"x2"', '1 1/2"x2 1/2"', '1 1/2"x3"', '2"x3"', '3"x4"', '4"x6"', '6"x8"', '6"x10"'];
const ANSI_ORIF = ['E', 'F', 'G', 'H', 'J', 'L', 'M', 'Q', 'R']; // API 526; 1"x2": D quando d0=18 mm
const ANSI_A0 = [398, 661, 661, 1018, 1590, 2688, 6362, 8825, 12272]; // mm2 (1"x2": 254 p/ vapor 1-2 barg)
const ANSI_D0 = [22.5, 29, 29, 36, 45, 58.5, 90, 106, 125]; // mm

/* ---- engine ANSI: ASME VIII / API 520 (interno em unid. ANSI; IO em bar / kg-h) ---- */
function calcValvANSI(media, setP, flow, backP, tAgua, tAr) {
  const PSI = 14.503774, out = [], isV = media === "Vapor Saturado", isAr = media === "Ar comprimido";
  for (let i = 0; i < ANSI_NPS.length; i++) {
    let A0 = ANSI_A0[i], orif = ANSI_ORIF[i], d0 = ANSI_D0[i];
    if (i === 0 && (isV || isAr) && setP <= 2.0) { A0 = 254; orif = 'D'; d0 = 18; } // NPS 1"x2": d0=18 mm p/ vapor/gas set 1-2 barg (nota 2)
    const Ain = A0 / 645.16; let W0 = null, K = null;
    if (isV || isAr) {
      const p = setP * PSI, p1 = (p < 30) ? (p + 3 + 14.7) : (p * 1.10 + 14.7); // psia; <2,05 barg: overpressure fixa 0,21 bar (nota 1)
      K = (setP < 2.05) ? 0.769 : 0.817; // K certificado UV/NB (vapor/gas)
      const kbOK = backP <= 0.30 * setP + 1e-9; // Kb=1 ate 30% (API 520); acima: diagrama (nao calculado)
      if (kbOK) {
        if (isV) W0 = 51.5 * Ain * p1 * K * 0.4535924; // vapor saturado: KN=1, KSH=1 -> kg/h
        else { // ar: API 520 gas, C=356 (k=1,4), M=28,97, Z=1
          const TR = ((isFinite(tAr) ? tAr : 20) + 273.15) * 1.8; // temperatura absoluta em Rankine
          W0 = 356 * K * Ain * p1 * Math.sqrt(28.97 / TR) * 0.4535924; // kg/h
        }
      }
    } else {
      const rho = aguaRho(tAgua), dP = 1.10 * setP - backP; // bar
      K = 0.545; // liquido: reproduz tabelas de capacidade
      if (dP > 0) { const Qgpm = 38 * K * Ain * Math.sqrt((dP * PSI) / (rho / 1000)); W0 = Qgpm * 0.2271247 * rho; } // kg/h
    }
    out.push({ bocal: ANSI_NPS[i], W0, fs: (W0 != null && flow > 0) ? (W0 - flow) / flow : null, A0, orif, d0, K });
  }
  return out;
}

/* ======== VÁLVULA DE ALÍVIO BRONZE (MIPEL) ======== */
const BRZ_DN = ['1/2', '3/4', '1', '1 1/4', '1 1/2', '2', '2 1/2', '3'];
const BRZ_PSI = [25, 50, 75, 100, 125, 150];
const BRZ_AR_RHO = 1.293; // kg/m3 (ar livre, 0 C, 1,01325 bar)
const BRZ_CAP = {
  agua: { // l/min (25% sobrepressao)
   '1/2': [4.6, 7.6, 10.2, 13.2, 16.6, 20.4], '3/4': [7.9, 12.5, 17.0, 21.6, 26.5, 30.3],
   '1': [18.9, 32.9, 45.4, 57.5, 68.5, 79.0], '1 1/4': [25.0, 50.3, 68.5, 80.3, 91.5, 100.0],
   '1 1/2': [32.9, 60.6, 91.6, 121.0, 150.0, 179.0], '2': [47.3, 94.9, 136.0, 170.0, 205.0, 240.0],
   '2 1/2': [106.0, 140.0, 174.0, 208.0, 242.0, 276.0], '3': [220.0, 291.0, 348.0, 401.0, 454.0, 507.0] },
  ar: { // m3/min livre (10% sobrepressao)
   '1/2': [0.90, 1.39, 1.95, 2.49, 2.97, 3.43], '3/4': [1.36, 2.15, 2.69, 3.11, 3.45, 3.94],
   '1': [1.89, 3.59, 4.44, 5.35, 6.08, 6.82], '1 1/4': [3.65, 6.37, 8.89, 10.33, 11.49, 12.48],
   '1 1/2': [4.41, 8.15, 10.93, 12.40, 14.46, 16.82], '2': [6.34, 10.47, 14.01, 17.27, 19.90, 23.13] },
  vapor: { // kg/h (10% sobrepressao)
   '1/2': [40.8, 62.4, 87.5, 112.0, 134.0, 154.0], '3/4': [61.2, 96.2, 121.0, 139.0, 155.0, 177.0],
   '1': [85.3, 162.0, 200.0, 241.0, 274.0, 307.0], '1 1/4': [163.0, 287.0, 400.0, 465.0, 509.0, 561.0],
   '1 1/2': [202.0, 366.0, 492.0, 557.0, 650.0, 756.0], '2': [285.0, 470.0, 630.0, 776.0, 895.0, 1041.0] }
};
const BRZ_MODELS = {
  'Fig. 037': { fig: '037', fluidos: ['agua', 'vapor'] },
  'Fig. 038': { fig: '038', fluidos: ['agua', 'ar'] }
};
function brzCapKgh(fluido, dn, psi, tA) {
  const tab = BRZ_CAP[fluido]; if (!tab || !tab[dn]) return null;
  if (psi < BRZ_PSI[0] || psi > BRZ_PSI[BRZ_PSI.length - 1]) return null; // fora da faixa 25-150 PSI
  const cap = interp(BRZ_PSI, tab[dn], psi);
  if (fluido === 'agua') return cap * 60 * aguaRho(isNaN(tA) ? 20 : tA) / 1000; // l/min -> kg/h
  if (fluido === 'ar') return cap * 60 * BRZ_AR_RHO; // m3/min livre -> kg/h
  return cap; // vapor: ja em kg/h
}
function calcBronze(key, fluido, setP, reqFlow, tA) {
  const m = BRZ_MODELS[key]; if (!m || m.fluidos.indexOf(fluido) < 0 || !BRZ_CAP[fluido]) return null;
  const psi = setP * 14.5038;
  return BRZ_DN.filter(dn => BRZ_CAP[fluido][dn] != null).map(dn => {
    const W = brzCapKgh(fluido, dn, psi, tA);
    const fs = (W != null && reqFlow > 0) ? (W - reqFlow) / reqFlow : null;
    return { bocal: dn + '"', dn, W0: W, fs };
  });
}

/* overpressure — só os dois modelos DIN usados p/ o "op" numérico em calcValv
 * (25.911/25.912 sempre 10%, sem exceção para água; a exceção de 25% só
 * existe nos modelos bronze, que não usam "op" no cálculo numérico). */
const PSV_OVER_DIN = { '25.911': '10%', '25.912': '10%' };
function psvOverNum(model) {
  const v = parseFloat(String(PSV_OVER_DIN[model] || '10%').replace(/[^0-9.,-]/g, '').replace(',', '.'));
  return isFinite(v) ? v : 10;
}

// computePSV: núcleo puro. Retorna as linhas DIN (r911/r942), ANSI e bronze
// (por figura) já calculadas; o cliente decide quais "cards" mostrar
// (isAtivo por modelo) e formata os números (uNum/kghToUnit/pct), como já
// fazia com os resultados de calcValv/calcValvANSI/calcBronze antes da
// migração. Erros dependentes de unidade voltam como errCode + valor bruto
// (mesmo padrão de reducSuper/reducAgua) para o cliente remontar o texto com uP().
function computePSV(inputs = {}) {
  const media = inputs.media;
  const setP = Number(inputs.setP);
  const backP = Number(inputs.backP);
  const tAgua = Number(inputs.tAgua);
  const tAr = (inputs.tAr != null && isFinite(Number(inputs.tAr))) ? Number(inputs.tAr) : 20;
  const flow = Number(inputs.flow);

  const isV = media === 'Vapor Saturado';
  const isAr = media === 'Ar comprimido';
  const fluidKey = isV ? 'vapor' : (isAr ? 'ar' : 'agua');

  let err = null, errCode = null, errRaw = null;
  if (!(setP >= 0.2)) { errCode = 'min_setp'; errRaw = 0.2; }
  else if (isV && setP > 34) { errCode = 'max_setp_vapor'; errRaw = 34; }
  else if (fluidKey === 'agua' && setP > 40) { errCode = 'max_setp_agua'; errRaw = 40; }
  else if (!(flow > 0)) { err = 'Vazão requerida deve ser maior que 0.'; }
  else if (fluidKey === 'agua' && (tAgua < 0 || tAgua > 100)) { err = 'Temperatura da água deve estar entre 0 e 100 °C.'; }
  const hasErr = !!(err || errCode);

  const op = isAr ? 10 : psvOverNum(isV ? '25.912' : '25.911');

  let r911 = null, r942 = null, ansi = null;
  const bronze = {};

  if (!hasErr) {
    if (!isAr) {
      const rows = calcValv(media, setP, flow, op, backP, tAgua);
      r911 = rows.slice(0, 13);
      r942 = rows.slice(13, 16).map((x, i) => ({ ...x, bocal: ["15/20", "20/25", "25/32"][i] }));
    }
    if (setP >= 1 && setP <= 34) {
      ansi = calcValvANSI(media, setP, flow, backP, tAgua, tAr);
    }
    for (const key of Object.keys(BRZ_MODELS)) {
      if (BRZ_MODELS[key].fluidos.indexOf(fluidKey) >= 0) {
        bronze[key] = calcBronze(key, fluidKey, setP, flow, tAgua);
      }
    }
  }

  return { err, errCode, errRaw, fluidKey, isV, isAr, op, r911, r942, ansi, bronze };
}

/* ===================== Helpers de vapor/tubulação já usados no index.html
 * (steamHg/steamHl/pipeArea) — verbatim, agora também disponíveis no servidor
 * para os módulos Tanque, Velocidade e Condensado. ===================== */
function steamHg(barg) { return interpC(ENG.steam.P_bara, ENG.steam.hV_kJkg, barg + 1.01325); } // kJ/kg
function steamHl(barg) { return interpC(ENG.steam.P_bara, ENG.steam.hL_kJkg, barg + 1.01325); } // kJ/kg
function pipeArea(size, sch) { const D = SCHED[sch] || SCHED['40']; const id = D[size]; return id ? Math.PI / 4 * Math.pow(id / 1000, 2) : 0; }

/* ===================== AQUECIMENTO DE FLUIDO EM TANQUES (Consumo de Vapor) =====================
 * O cliente resolve cp/rho do fluido (catálogo local, editável em localStorage,
 * base = FLUIDS_BASE) e envia os valores já resolvidos — evita duplicar o
 * catálogo editável no servidor. Idem para a lista de injetores. */
const FLUIDS_BASE = {
  agua: { nome: "Água", cp: 4.186, rho: 998 },
  oleo_termico: { nome: "Óleo térmico mineral (representativo)", cp: 1.90, rho: 870 },
  oleo_vegetal: { nome: "Óleo vegetal (soja)", cp: 1.97, rho: 917 },
  etilenoglicol: { nome: "Etilenoglicol (100%)", cp: 2.36, rho: 1113 },
  propilenoglicol: { nome: "Propilenoglicol (100%)", cp: 2.48, rho: 1036 },
  glicerina: { nome: "Glicerina", cp: 2.43, rho: 1261 },
  etanol: { nome: "Etanol", cp: 2.44, rho: 789 },
  leite: { nome: "Leite integral", cp: 3.93, rho: 1030 }
};
/* Injetores de vapor (injeção direta) — vazão [kg/h] = a·P[bar(g)] + b */
const INJECTORS_BASE = {
  "IN 15": { a: 18, b: 12, dn: '1/2"' },
  "IN 25": { a: 70, b: 70, dn: '1"' },
  "IN 40": { a: 180, b: 190, dn: '1.1/2"' }
};
function injCap(o, P) { return (Number(o.a) || 0) * P + (Number(o.b) || 0); } // kg/h

function computeTanque(inputs = {}) {
  const KCAL = 4.1868;
  const cpK = Number(inputs.cpK), rho = Number(inputs.rho);
  const V = Number(inputs.V), T1 = Number(inputs.T1), T2 = Number(inputs.T2), th = Number(inputs.th), P = Number(inputs.P);
  const rep = Number(inputs.rep), xq = Number(inputs.xq);
  if ([V, T1, T2, th, P].some(x => isNaN(x)) || isNaN(cpK) || isNaN(rho)) return { invalid: true };

  const repv = isNaN(rep) ? 0 : rep, xv = (isNaN(xq) || xq <= 0) ? 1 : Math.min(1, xq > 1 ? xq / 100 : xq);
  const m = rho * V, dT = T2 - T1;
  const Tsat = vaporTemp(P);
  const E_kJ = m * cpK * dT, E_kWh = E_kJ / 3600;
  const Q_kW = th > 0 ? E_kJ / (th * 3600) : NaN;
  const hg = steamHg(P), hl = steamHl(P), hfg = hg - hl;
  let hfT2 = interpC(ENG.steam.T_C, ENG.steam.hL_kJkg, T2); if (hfT2 == null || isNaN(hfT2)) hfT2 = KCAL * T2;
  const denomDir = (hl + xv * hfg) - hfT2;
  const mRep = rho * repv, Qrep_kJh = mRep * cpK * dT, Qrep_kW = Qrep_kJh / 3600;
  const hfgEff = xv * hfg;
  const ind_hu = (th > 0 && hfgEff > 0) ? E_kJ / (th * hfgEff) : NaN;
  const dir_hu = (th > 0 && denomDir > 0) ? E_kJ / (th * denomDir) : NaN;
  const ind_rep = hfgEff > 0 ? Qrep_kJh / hfgEff : NaN;
  const dir_rep = denomDir > 0 ? Qrep_kJh / denomDir : NaN;
  const ind_huTot = ind_hu * th, dir_huTot = dir_hu * th;
  const condDir = dir_huTot + (isNaN(dir_rep) ? 0 : dir_rep * th);

  const injList = (Array.isArray(inputs.injectors) && inputs.injectors.length)
    ? inputs.injectors
    : Object.keys(INJECTORS_BASE).map(k => ({ mdl: k, ...INJECTORS_BASE[k] }));
  const injRows = injList.map(o => {
    const cap = injCap(o, P);
    const nHu = (cap > 0 && dir_hu > 0) ? Math.ceil(dir_hu / cap) : 0;
    const nRep = (cap > 0 && !isNaN(dir_rep) && dir_rep > 0) ? Math.ceil(dir_rep / cap) : 0;
    return { mdl: o.mdl, dn: o.dn || null, cap, nHu, nRep };
  });

  return {
    invalid: false, m, dT, E_kWh, Q_kW, Qrep_kW, Tsat,
    ind_hu, ind_huTot, ind_rep, hfgEff,
    dir_hu, dir_huTot, dir_rep, denomDir, condDir,
    injRows, th, repv,
  };
}

/* ===================== VAZÃO EM BICO INJETOR (Outros) =====================
 * Q [m³/h] = Cd · D²[mm] · sqrt(P[kgf/cm²(g)]) — fórmula trivial, mantida
 * também no cliente para desenhar o gráfico interativo (múltiplas curvas de
 * diâmetro); o valor "oficial" do resultado vem do servidor. */
function bicoQ(cd, D, P) { return cd * D * D * Math.sqrt(Math.max(0, P)); }
function computeBicoInj(inputs = {}) {
  const P = Number(inputs.P), D = Number(inputs.D), cd = Number(inputs.cd);
  let n = Math.round(Number(inputs.n)); if (isNaN(n) || n < 1) n = 1;
  if ([P, D, cd].some(isNaN) || P < 0 || D <= 0 || cd <= 0) return { invalid: true };
  const q1 = bicoQ(cd, D, P), qt = n * q1;
  return { invalid: false, q1, qt, n };
}

/* ===================== RESISTÊNCIA EM SENSOR DE TEMPERATURA (Outros) =====================
 * RTD Pt100/Pt1000 — Callendar–Van Dusen (IEC 60751, α = 0,00385). */
const RTD_A = 3.9083e-3, RTD_B = -5.775e-7, RTD_C = -4.183e-12;
function rOfT(R0, T) { return T >= 0 ? R0 * (1 + RTD_A * T + RTD_B * T * T) : R0 * (1 + RTD_A * T + RTD_B * T * T + RTD_C * (T - 100) * T * T * T); }
function tOfR(R0, R) {
  const ratio = R / R0;
  if (ratio >= 1) return (-RTD_A + Math.sqrt(RTD_A * RTD_A - 4 * RTD_B * (1 - ratio))) / (2 * RTD_B);
  let lo = -200, hi = 0;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (rOfT(R0, mid) < R) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function computeSensorTemp(inputs = {}) {
  const R0 = Number(inputs.R0) || 100;
  const modo = inputs.modo; // 'RT' (informou resistência) | 'TR' (informou temperatura)
  const val = Number(inputs.val);
  if (isNaN(val)) return { invalid: true };
  let T = null, R = null, warn = null;
  if (modo === 'RT') {
    T = tOfR(R0, val);
    if (T < -200 || T > 850) warn = 'Resistência fora da faixa IEC 60751 (-200 a 850 °C).';
  } else {
    if (val < -200 || val > 850) warn = 'Fora da faixa IEC 60751 (-200 a 850 °C).';
    R = rOfT(R0, val);
  }
  const refs = [-100, -50, 0, 25, 50, 100, 150, 200, 300, 400, 600];
  const tref = refs.map(t => ({ t, R: rOfT(R0, t) }));
  return { invalid: false, R0, modo, T, R, val, warn, tref };
}

/* ===================== VELOCIDADE EM TUBULAÇÃO / CONDENSADO (Outros / Estudos) =====================
 * Matriz bitola × schedule compartilhada pelos módulos "Velocidade de
 * Líquidos e Gases" e "Velocidade Linha de Condensado". */
const VTYPE = {
  liq: { lo: 1, hi: 3, nome: 'Líquido (água/processo)' },
  vsat: { lo: 15, hi: 40, nome: 'Vapor saturado' },
  vsup: { lo: 30, hi: 60, nome: 'Vapor superaquecido' },
  gas: { lo: 10, hi: 30, nome: 'Gás / ar comprimido' },
};
const PIPE_NPS = ['1/2', '3/4', '1', '1.1/4', '1.1/2', '2', '2.1/2', '3', '4', '5', '6', '8', '10', '12', '14', '16', '18', '20', '24'];
const PIPE_SCH_KEYS = [['5', '5S'], ['10', '10S'], ['40', '40'], ['80', '80']];
function velocityMatrix(Qm3s, lo, hi) {
  return PIPE_NPS.map(n => ({
    sz: n,
    cols: PIPE_SCH_KEYS.map(([sc]) => {
      const A = pipeArea(n, sc);
      if (!(A > 0)) return null;
      const v = Qm3s / A, idmm = Math.sqrt(4 * A / Math.PI) * 1000;
      return { v, idmm, ok: (v >= lo && v <= hi) };
    }),
  }));
}

function computeVeloc(inputs = {}) {
  const flow = Number(inputs.flow);
  if (isNaN(flow) || flow <= 0) return { invalid: true };
  const unit = inputs.unit, rho = Number(inputs.rho);
  let Qm3h;
  if (unit === 'kgh') { if (isNaN(rho) || rho <= 0) return { invalid: true, errRho: true }; Qm3h = flow / rho; }
  else if (unit === 'm3h') Qm3h = flow;
  else if (unit === 'lmin') Qm3h = flow * 60 / 1000;
  else if (unit === 'lh') Qm3h = flow / 1000;
  else if (unit === 'ls') Qm3h = flow * 3600 / 1000;
  else if (unit === 'm3s') Qm3h = flow * 3600;
  else Qm3h = flow;
  const Qm3s = Qm3h / 3600;
  const massKgh = (unit === 'kgh') ? flow : null;
  const r = VTYPE[inputs.type] || VTYPE.liq;
  const matrix = velocityMatrix(Qm3s, r.lo, r.hi);
  return { invalid: false, Qm3h, Qm3s, massKgh, lo: r.lo, hi: r.hi, typeName: r.nome, matrix };
}

function computeCondens(inputs = {}) {
  const mcond = Number(inputs.mcond);
  if (isNaN(mcond) || mcond <= 0) return { invalid: true };
  const p1 = Number(inputs.p1), p2 = Number(inputs.p2);
  if (isNaN(p1) || isNaN(p2)) return { invalid: true, errP: true };
  const hf1 = steamHl(p1), hf2 = steamHl(p2), hg2 = steamHg(p2), hfg2 = hg2 - hf2;
  let x = (hfg2 > 0) ? (hf1 - hf2) / hfg2 : 0; if (x < 0) x = 0;
  const mflash = mcond * x, vg2 = vaporVolWet(p2, 1);
  const Qm3h = mflash * vg2, Qm3s = Qm3h / 3600;
  const lo = 15, hi = 25;
  const matrix = velocityMatrix(Qm3s, lo, hi);
  return { invalid: false, mcond, p1, p2, hf1, hf2, hfg2, x, mflash, vg2, Qm3h, Qm3s, lo, hi, matrix };
}

/* ===================== RESISTÊNCIA EM TUBO — ASME B31.3 (Estudos e Análises) ===================== */
function computeResTubo(inputs = {}) {
  const P = Number(inputs.P), d = Number(inputs.d), S = Number(inputs.S), Y = Number(inputs.Y), E = Number(inputs.E), C = Number(inputs.C), enom = Number(inputs.enom);
  const den = 2 * (S * E + P * Y - P);
  const epress = (den !== 0) ? P * d / den : null; // mm
  const emin = (epress != null) ? epress + C : null; // mm
  const tl = enom - C;
  const mawp = (tl > 0) ? 2 * tl * S * E / (d + 2 * tl * (1 - Y)) : null;
  const ok = (emin != null && !isNaN(enom)) ? enom >= emin : null;
  return { P, d, S, Y, E, C, enom, epress, emin, mawp, ok, tl };
}

/* ===================== PERDA DE ENERGIA EM TUBULAÇÕES (isolamento) =====================
   Catálogos: PIPE_OD / SCH_W são tabelas fixas (ASME B36.10M), sem cadastro/admin — o
   cliente resolve od2/esp localmente e envia já resolvidos (evita duplicar 2 tabelas triviais).
   FUELS_BASE e INSUL_BASE SÃO editáveis via admin (localStorage) — por isso NÃO são
   duplicados aqui; o cliente resolve pci/rhof/isolKc/semmi e envia os valores já resolvidos,
   no mesmo padrão usado por `tanque` (cp/rho resolvidos no cliente). */
const _PERDATUB_SIG = 5.670373e-8;
const _PERDATUB_APTCCF = [3.17176340059636e-11, -5.90229390417841e-08, 4.58530859816365e-06, 8.88678875849625e-02, 0.520072239422081];
const _PERDATUB_APKVCF = [2.25852005041673e-11, -8.32092849344177e-08, 1.72673155161796e-04, 0.01063728017828, -0.761083591331285];
const _PERDATUB_APACF = [1.35568635609021e-10, -3.80587677828228e-07, 4.46482543839259e-04, -3.59355277094557e-02, 2.2544891640868];
const _PERDATUB_APPNCF = [-2.0843785818883e-13, -1.72787234303014e-11, 8.00624293819887e-07, -6.94605925998444e-04, 0.845781217750258];
const _PERDATUB_PCS = [2.08333333333315e-09, 3.67044406375767e-19, -5.10833333333336e-02, 79];
function _perdaTubP5(c, x) { return c[0] * x * x * x * x + c[1] * x * x * x + c[2] * x * x + c[3] * x + c[4]; }
function _perdaTubP3(c, x) { return c[0] * x * x * x + c[1] * x * x + c[2] * x + c[3]; }
function perdaTubHAir(tsurf, tamb, D, emiss, wind) {
  const tk = (tsurf + tamb) / 2 + 273.15;
  const k = _perdaTubP5(_PERDATUB_APTCCF, tk) / 1e3, pr = _perdaTubP5(_PERDATUB_APPNCF, tk), nu = _perdaTubP5(_PERDATUB_APKVCF, tk) / 1e6, al = _perdaTubP5(_PERDATUB_APACF, tk) / 1e6, b = 1 / tk;
  const Re = (D / 1000) * wind / nu;
  const Ra = 9.81 * b * Math.abs(tsurf - tamb) * Math.pow(D / 1000, 3) / (nu * al);
  const hrad = _PERDATUB_SIG * emiss * (Math.pow(tsurf + 273.15, 4) - Math.pow(tamb + 273.15, 4)) / ((tsurf + 273.15) - (tamb + 273.15));
  const nuf = 0.3 + (0.62 * Math.pow(Re, 0.5) * Math.pow(pr, 1 / 3)) * Math.pow(1 + Math.pow(Re / 282000, 5 / 8), 4 / 5) / Math.pow(1 + Math.pow(0.4 / pr, 2 / 3), 1 / 4);
  const nufree = Math.pow(0.6 + 0.387 * Math.pow(Ra, 1 / 6) / Math.pow(1 + Math.pow(0.559 / pr, 9 / 16), 8 / 27), 2);
  const nuc = Math.pow(Math.pow(nuf, 4) + Math.pow(nufree, 4), 1 / 4);
  return nuc * k / (D / 1000) + hrad;
}
function perdaTubBare(esp, od2, emiss, Top, Tamb, wind) {
  const id1 = od2 - 2 * esp; let tsurf = Tamb + 1, ti = 0, lastti = 0, loss = 0;
  for (let col = 1; col <= 5; col++) {
    if (col > 1) { lastti = ti; tsurf = ti; }
    const ha = perdaTubHAir(tsurf, Tamb, od2, emiss, wind); const kp = _perdaTubP3(_PERDATUB_PCS, Top + 273.15);
    const Rp = (od2 / 1000) * Math.log(od2 / id1) / (2 * kp); const q = (Top - Tamb) / (Rp + 1 / ha);
    ti = Top - q * Rp; loss = q * Math.PI * (od2 / 1000);
  }
  return { tsurf: lastti, loss };
}
function perdaTubInsul(esp, od2, Top, Tamb, wind, espi, semmi, kc) {
  const id1 = od2 - 2 * esp, od3 = od2 + 2 * espi; let tsurf = Tamb + 1, tinter = Top - 1, ts = 0, ti = 0, lastts = 0, loss = 0;
  for (let col = 1; col <= 5; col++) {
    if (col > 1) { lastts = ts; tsurf = ts; tinter = ti; }
    const ha = perdaTubHAir(tsurf, Tamb, od3, semmi, wind); const kp = _perdaTubP3(_PERDATUB_PCS, Top + 273.15);
    const Rp = (od3 / 1000) * Math.log(od2 / id1) / (2 * kp);
    const avg = (tsurf + tinter) / 2 + 273.15; const kins = _perdaTubP5(kc, avg);
    const Rins = (od3 / 1000) * Math.log(od3 / od2) / (2 * kins);
    const q = (Top - Tamb) / (Rins + Rp + 1 / ha); ti = Top - q * Rp; ts = ti - q * Rins; loss = q * Math.PI * (od3 / 1000);
  }
  return { tsurf: lastts, loss, od3 };
}
function computePerdaTub(inputs = {}) {
  const od2 = Number(inputs.od2), esp = Number(inputs.esp);
  const L = Number(inputs.L), emiss = Number(inputs.emiss), Top = Number(inputs.Top), Tamb = Number(inputs.Tamb), wind = Number(inputs.wind);
  if (!od2 || !esp || [L, emiss, Top, Tamb, wind].some(isNaN) || od2 - 2 * esp <= 0) return { invalid: true };
  const topBelowAmb = Top <= Tamb;
  const b = perdaTubBare(esp, od2, emiss, Top, Tamb, wind);
  const lossNuTot_kW = b.loss * L / 1000;
  const espi = Number(inputs.espi), semmi = Number(inputs.semmi), isolKc = inputs.isolKc;
  const hasIsol = !!(Array.isArray(isolKc) && isolKc.length === 5 && !isNaN(espi) && espi > 0 && !isNaN(semmi));
  let isolResult = null, lossIsol = 0;
  if (hasIsol) {
    const r = perdaTubInsul(esp, od2, Top, Tamb, wind, espi, semmi, isolKc);
    lossIsol = r.loss;
    isolResult = { tsurf: r.tsurf, loss: r.loss, od3: r.od3, lossTot_kW: r.loss * L / 1000 };
  }
  const red = b.loss - lossIsol, en_kW = red * L / 1000, en_kcal = en_kW * 860, vapor = en_kcal / 509.8;
  const pci = Number(inputs.pci), rhof = Number(inputs.rhof), preco = Number(inputs.preco), hd = Number(inputs.hd), dm = Number(inputs.dm), inv = Number(inputs.inv);
  let econMes = null, amortMeses = null;
  if (!isNaN(pci) && !isNaN(rhof) && !isNaN(preco) && !isNaN(hd) && !isNaN(dm) && pci > 0 && rhof > 0) {
    econMes = en_kcal * hd * dm / (pci * rhof) * preco;
    if (!isNaN(inv) && econMes > 0) amortMeses = inv / econMes;
  }
  return {
    invalid: false, topBelowAmb,
    bare: { tsurf: b.tsurf, loss: b.loss, lossTot_kW: lossNuTot_kW },
    isol: isolResult, hasIsol,
    red, en_kW, en_kcal, vapor, econMes, amortMeses,
  };
}

/* ===================== ESTUDO DE EFLUENTE LÍQUIDO =====================
   TROCADORES (modelo/alt/larg/pmta/área) é catálogo editável (admin, localStorage) mas
   NÃO entra no cálculo térmico — é só informativo/exibição — fica 100% no cliente.
   cpeffK/cpsecK/custo chegam já resolvidos (conversão de unidade kcal↔kJ e R$/kg,ton,m³
   feita no cliente, sem depender de catálogo) — mesmo padrão do `tanque`. */
function computeEfluente(inputs = {}) {
  const KCAL = 4.1868;
  const meff = Number(inputs.meff), cpeffK = Number(inputs.cpeffK), tin = Number(inputs.tin), tout = Number(inputs.tout);
  if ([meff, cpeffK, tin, tout].some(isNaN) || meff <= 0 || tin <= tout) return { invalid: true };
  const msec = Number(inputs.msec), cpsecK = Number(inputs.cpsecK), tinsec = Number(inputs.tinsec);
  const Q_kJ = meff * cpeffK * (tin - tout), en_kcal = Q_kJ / KCAL, pot_kW = Q_kJ / 3600;
  const toutsec = (!isNaN(msec) && msec > 0 && !isNaN(cpsecK) && cpsecK > 0 && !isNaN(tinsec)) ? tinsec + Q_kJ / (msec * cpsecK) : null;
  const hfg3 = (steamHg(3) - steamHl(3)) / KCAL, eqVapor = en_kcal / hfg3;
  const PCI = Number(inputs.PCI), rho = Number(inputs.rho), custo = Number(inputs.custo), co2 = Number(inputs.co2);
  const hd = isNaN(Number(inputs.hd)) ? 0 : Number(inputs.hd), dm = isNaN(Number(inputs.dm)) ? 0 : Number(inputs.dm), inv = Number(inputs.inv);
  const combKgh = (!isNaN(PCI) && PCI > 0) ? en_kcal / PCI : null;
  const combM3h = (combKgh != null && !isNaN(rho) && rho > 0) ? combKgh / rho : null;
  const vDia = eqVapor * hd, vMes = vDia * dm, vAno = vMes * 12;
  const combDia = (combM3h != null) ? combM3h * hd : null, combMes = (combDia != null) ? combDia * dm : null, combAno = (combMes != null) ? combMes * 12 : null;
  const ecoDia = (combDia != null && !isNaN(custo)) ? combDia * custo : null, ecoMes = (combMes != null && !isNaN(custo)) ? combMes * custo : null, ecoAno = (combAno != null && !isNaN(custo)) ? combAno * custo : null;
  const amort = (ecoMes != null && ecoMes > 0 && !isNaN(inv)) ? inv / ecoMes : null;
  const co2Dia = (combKgh != null && !isNaN(co2)) ? combKgh * hd * co2 : null, co2Mes = (co2Dia != null) ? co2Dia * dm / 1000 : null, co2Ano = (co2Mes != null) ? co2Mes * 12 : null;
  return {
    invalid: false, meff, cpeffK, tin, tout, msec, cpsecK, tinsec, Q_kJ, en_kcal, pot_kW, toutsec, eqVapor,
    PCI, rho, custo, co2, hd, dm, inv, combKgh, combM3h, vDia, vMes, vAno, combDia, combMes, combAno,
    ecoDia, ecoMes, ecoAno, amort, co2Dia, co2Mes, co2Ano,
  };
}

/* ===================== ANÁLISE DE CUSTO DO VAPOR / CALDEIRA =====================
   Sem catálogo proprietário embutido no cálculo (FUELS só dá o nome de exibição, que
   fica no cliente); custoAgua/custoCombIn chegam já parseados (moneyParse é um parser
   de string BRL, puramente de UI, roda no cliente) — o restante é fórmula pura. */
function computeCustoVap(inputs = {}) {
  const KC = 4.1868, KWH_KCAL = 860;
  const mv = Number(inputs.mv), P = Number(inputs.P), eficPct = Number(inputs.eficPct), perdasPct = Number(inputs.perdasPct);
  if ([mv, P, eficPct].some(isNaN) || mv <= 0) return { invalid: true };
  const efic = eficPct / 100, perdas = (isNaN(perdasPct) ? 0 : perdasPct) / 100;
  const Tsat = vaporTemp(P), hg = steamHg(P) / KC;
  if (hg == null || !isFinite(hg)) return { invalid: true };
  const mAlim = mv * (1 + perdas);

  const reposIn = Number(inputs.reposIn), reposUn = inputs.reposUn || 'pct';
  let taxa = NaN, mMakeup = NaN;
  if (!isNaN(reposIn)) {
    if (reposUn === 'kgh') { mMakeup = reposIn; taxa = (mv > 0) ? mMakeup / mv : NaN; }
    else { taxa = reposIn / 100; mMakeup = taxa * mv; }
  }

  const Tret = Number(inputs.Tret), Tmu = Number(inputs.Tmu);
  let Talim;
  if (!isNaN(mMakeup) && !isNaN(Tret) && !isNaN(Tmu) && mAlim > 0) {
    const mMk = Math.min(Math.max(mMakeup, 0), mAlim), mRt = mAlim - mMk;
    Talim = (mRt * Tret + mMk * Tmu) / mAlim;
  } else if (!isNaN(Tret)) { Talim = Tret; } else { Talim = NaN; }
  const hAlim = isNaN(Talim) ? 0 : Talim; // hAgua(T) = T (cp=1 kcal/kg·°C, ref 0°C)
  const delta = hg - hAlim;
  if (!(delta > 0)) return { invalid: true };

  const potKcal = mv * delta, potKW = potKcal / KWH_KCAL;
  const PCI = Number(inputs.PCI), dens = Number(inputs.dens);
  const efPCI = (!isNaN(PCI) && PCI > 0) ? PCI * efic : null;
  const eqMassa = (efPCI != null) ? efPCI / delta : null;
  const eqVol = (eqMassa != null && !isNaN(dens)) ? eqMassa * dens : null;
  const consumoKg = (efPCI != null) ? mAlim * delta / efPCI : null;
  const consumoM3 = (consumoKg != null && !isNaN(dens) && dens > 0) ? consumoKg / dens : null;

  const custoAgua = Number(inputs.custoAgua);
  const custoMakeup = (!isNaN(taxa) && !isNaN(custoAgua)) ? taxa * custoAgua : null;

  const custoCombIn = Number(inputs.custoCombIn), custoUn = inputs.custoUn || 'ton';
  let custoComb = null;
  if (!isNaN(custoCombIn)) {
    if (custoUn === 'kg') custoComb = custoCombIn * 1000;
    else if (custoUn === 'm3') custoComb = (!isNaN(dens) && dens > 0) ? custoCombIn / (dens / 1000) : null;
    else custoComb = custoCombIn;
  }
  const custoCombKg = (custoComb != null) ? custoComb / 1000 : null;
  const custoCombM3 = (custoComb != null && !isNaN(dens)) ? custoComb * (dens / 1000) : null;
  const custoCombVapor = (custoComb != null && eqMassa != null && eqMassa > 0) ? custoComb / eqMassa : null;

  const custoTon = (custoCombVapor != null ? custoCombVapor : 0) + (custoMakeup != null ? custoMakeup : 0);
  const custoTonOK = (custoCombVapor != null && custoMakeup != null);
  const hd = Number(inputs.hd), dm = Number(inputs.dm);
  const horasMes = (!isNaN(hd) && !isNaN(dm)) ? hd * dm : null;
  const custoMes = (custoTonOK && horasMes != null) ? custoTon * (mv / 1000) * hd * dm : null;
  const custoMWh = (custoTonOK && delta > 0) ? custoTon / ((delta * 1000) / (KWH_KCAL * 1000)) : null;
  return {
    invalid: false, mv, P, efic, eficPct, perdas, perdasPct, Tsat, hg, mAlim, Tret, Tmu, Talim, hAlim, delta,
    reposUn, custoUn, potKcal, potKW, PCI, dens, eqMassa, eqVol, consumoKg, consumoM3, taxa, mMakeup,
    custoAgua, custoMakeup, custoComb, custoCombKg, custoCombM3, custoCombVapor, custoTon, custoTonOK,
    hd, dm, horasMes, custoMes, custoMWh,
  };
}

/* ===================== TUBULAÇÃO DE VAPOR / ÁGUA — perda de carga (Colebrook-White) =====================
   NPS/KFITS/ROUGH (bitolas e fatores K de conexões, materiais/rugosidade) são tabelas de
   referência fixas, sem admin — ficam só no cliente para montar os selects; o cliente
   envia cada item já resolvido (dn/sch/L/eps ou K/qtd), no mesmo padrão de `purg`/`psv`. */
function colebrookFriction(Re, rr) {
  if (!(Re > 0)) return null;
  let f = 0.02;
  for (let i = 0; i < 60; i++) { const x = rr / 3.7 + 2.51 / (Re * Math.sqrt(f)); f = Math.pow(-2 * Math.log10(x), -2); }
  return f;
}
function schedIDm(dn, sch) { const T = SCHED[sch] || SCHED['40']; return (T && T[dn]) ? T[dn] / 1000 : null; }

function tubVaporSteamMuSat(barg) {
  if (isNaN(barg)) return null;
  const Tc = vaporTemp(barg);
  const Tk = [100, 150, 200, 250, 300], MK = [12.28, 14.19, 16.18, 18.22, 20.29];
  let mu;
  if (Tc <= Tk[0]) mu = MK[0];
  else if (Tc >= Tk[Tk.length - 1]) mu = MK[MK.length - 1];
  else { for (let i = 0; i < Tk.length - 1; i++) { if (Tc >= Tk[i] && Tc <= Tk[i + 1]) { const f = (Tc - Tk[i]) / (Tk[i + 1] - Tk[i]); mu = MK[i] + f * (MK[i + 1] - MK[i]); break; } } }
  return mu * 1e-6;
}
function computeTubVapor(inputs = {}) {
  const press = Number(inputs.press), x = Number(inputs.x), flow = Number(inputs.flow);
  const items = Array.isArray(inputs.items) ? inputs.items : [];
  if (isNaN(press)) return { invalid: true };
  const xf = Math.min(Math.max((isNaN(x) ? 100 : x) / 100, 0), 1);
  const v = vaporVolWet(press, xf);
  const rho = (v > 0) ? 1 / v : null;
  const mu = tubVaporSteamMuSat(press);
  const results = items.map(it => {
    const D = schedIDm(it.dn, it.sch), A = pipeArea(it.dn, it.sch);
    if (rho == null || !A || !D || isNaN(flow)) return { id: it.id, v: null, dp: null };
    const vel = (flow / 3600) / (rho * A);
    const dyn = rho * vel * vel / 2;
    if (it.tipo === 'tubo') {
      if (isNaN(mu) || mu <= 0) return { id: it.id, v: vel, dp: null };
      const Re = rho * vel * D / mu, rr = (it.eps / 1000) / D, f = colebrookFriction(Re, rr);
      const dp = (f != null) ? f * (it.L / D) * dyn / 1e5 : null;
      return { id: it.id, v: vel, dp, Re, f, rr };
    }
    const dp = it.K * it.qtd * dyn / 1e5;
    return { id: it.id, v: vel, dp };
  });
  let pTubo = 0, pCon = 0, comp = 0, nAcc = 0, okT = true, okC = true;
  items.forEach((it, i) => {
    const r = results[i];
    if (it.tipo === 'tubo') { comp += it.L || 0; if (r.dp == null) okT = false; else pTubo += r.dp; }
    else { nAcc += it.qtd || 0; if (r.dp == null) okC = false; else pCon += r.dp; }
  });
  const total = pTubo + pCon, ppm = (comp > 0) ? total / comp : null;
  return { invalid: false, rho, mu, Tsat: vaporTemp(press), items: results, summary: { pTubo, pCon, total, comp, nAcc, ppm, okT, okC } };
}

/* ===================== TUBULAÇÃO DE ÁGUA — BOMBAS ELÉTRICAS =====================
   Tabelas de propriedades da água (WT/WRHO/WMU/WPV) são fixas (sem admin) — copiadas
   verbatim. NPS/KFITS/ROUGH ficam só no cliente (mesma razão do TubVapor). */
const _TUBAGUA_WT = [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100];
const _TUBAGUA_WRHO = [999.8, 1000.0, 999.7, 999.1, 998.2, 997.0, 995.6, 992.2, 988.0, 983.2, 977.8, 971.8, 965.3, 958.4];
const _TUBAGUA_WMU = [1792, 1519, 1307, 1138, 1002, 890, 798, 653, 547, 467, 404, 355, 315, 282].map(v => v * 1e-6);
const _TUBAGUA_WPV = [611, 872, 1228, 1706, 2339, 3169, 4246, 7384, 12349, 19932, 31176, 47373, 70117, 101325];
function tubAguaWinterp(Vk, T) {
  if (isNaN(T)) T = 20;
  if (T <= _TUBAGUA_WT[0]) return Vk[0];
  if (T >= _TUBAGUA_WT[_TUBAGUA_WT.length - 1]) return Vk[Vk.length - 1];
  for (let i = 0; i < _TUBAGUA_WT.length - 1; i++) { if (T >= _TUBAGUA_WT[i] && T <= _TUBAGUA_WT[i + 1]) { const f = (T - _TUBAGUA_WT[i]) / (_TUBAGUA_WT[i + 1] - _TUBAGUA_WT[i]); return Vk[i] + f * (Vk[i + 1] - Vk[i]); } }
  return Vk[Vk.length - 1];
}
function tubAguaQVol(flow, flowun, rho) {
  if (isNaN(flow)) return null;
  if (flowun === 'kgh') return (rho > 0) ? flow / rho / 3600 : null;
  if (flowun === 'kgs') return (rho > 0) ? flow / rho : null;
  if (flowun === 'm3h') return flow / 3600;
  if (flowun === 'ls') return flow / 1000;
  if (flowun === 'lmin') return flow / 1000 / 60;
  return flow / 3600;
}
function computeTubAgua(inputs = {}) {
  const GACC = 9.81, PATM = 101325;
  const temp = Number(inputs.temp);
  const rho = tubAguaWinterp(_TUBAGUA_WRHO, temp), mu = tubAguaWinterp(_TUBAGUA_WMU, temp), pvap = tubAguaWinterp(_TUBAGUA_WPV, temp);
  const flow = Number(inputs.flow), flowun = inputs.flowun || 'm3h';
  const q = tubAguaQVol(flow, flowun, rho); // m3/s
  const massFlow = (q != null) ? q * 3600 * rho : null; // kg/h
  const items = Array.isArray(inputs.items) ? inputs.items : [];
  function calcItem(it) {
    const D = schedIDm(it.dn, it.sch), A = pipeArea(it.dn, it.sch);
    if (isNaN(rho) || rho <= 0 || !A || !D || q == null) return { id: it.id, v: null, dh: null };
    const v = q / A, vh = v * v / (2 * GACC);
    if (it.tipo === 'tubo') {
      if (isNaN(mu) || mu <= 0) return { id: it.id, v, dh: null };
      const Re = rho * v * D / mu, rr = (it.eps / 1000) / D, f = colebrookFriction(Re, rr);
      return { id: it.id, v, dh: (f != null) ? f * (it.L / D) * vh : null, Re, f };
    }
    return { id: it.id, v, dh: it.K * it.qtd * vh };
  }
  const results = items.map(calcItem);
  let suc = 0, rec = 0, dist = 0, loc = 0;
  items.forEach((it, i) => {
    const r = results[i]; if (r.dh == null) return;
    if (it.loc === 'Sucção') suc += r.dh; else rec += r.dh;
    if (it.tipo === 'tubo') dist += r.dh; else loc += r.dh;
  });
  const summary = { suc, rec, dist, loc, total: suc + rec };

  function velAt(dn, sch) { const A = pipeArea(dn, sch); return (q != null && A) ? q / A : null; }
  const gamma = (!isNaN(rho)) ? rho * GACC : 9810;
  const hSuc = Number(inputs.hSuc), hRec = Number(inputs.hRec);
  const npshd = (gamma > 0 && !isNaN(hSuc) && pvap != null) ? ((PATM - pvap) / gamma) + hSuc - summary.suc : null;
  const hgeo = (isNaN(hRec) ? 0 : hRec) + (isNaN(hSuc) ? 0 : hSuc);
  const vrec = velAt(inputs.dnRec, inputs.schRec), vsuc = velAt(inputs.dnSuc, inputs.schSuc);
  const vhead = (vrec != null ? vrec * vrec / (2 * GACC) : 0) - (vsuc != null ? vsuc * vsuc / (2 * GACC) : 0);
  const hbomba = hgeo + summary.total + vhead;
  const hman = Number(inputs.hman), rend = Number(inputs.rend);
  const qnomm3h = (q != null) ? q * 3600 : null;
  const powW = (q != null && !isNaN(hman) && !isNaN(rend) && rend > 0) ? gamma * q * hman / (rend / 100) : null;
  const powCV = (powW != null) ? powW / 735.5 : null, powKW = (powW != null) ? powW / 1000 : null;
  const custo = Number(inputs.custo), hd = Number(inputs.hd), dm = Number(inputs.dm);
  const gasto = (powKW != null && !isNaN(custo) && !isNaN(hd) && !isNaN(dm)) ? powKW * hd * dm * custo : null;
  const pump = { gamma, npshd, hgeo, hbomba, vrec, vsuc, powCV, powKW, gasto, qnom: qnomm3h, hman, rend, custo, hd, dm };
  return { invalid: false, rho, mu, pvap, q, massFlow, items: results, summary, pump };
}

/* ===================== ESTUDO DE VAPOR FLASH (núcleo termodinâmico) =====================
   MIGRAÇÃO PARCIAL (documentada): apenas o núcleo termodinâmico + viabilidade econômica
   (flashCore + parte pura de flashData) foi migrado. A seleção de purgador de drenagem
   (PURG filtrado por isAtivo/admin) e a estação complementar de válvula redutora
   (VALV filtrado por isAtivo/admin, selects dependentes) permanecem 100% no cliente,
   pois dependem de estado de UI (quais modelos estão ativos/inativos no cadastro,
   filtragem ao vivo dos <select>) — replicar isso no servidor duplicaria lógica de
   catálogo editável, o que o princípio de separação pede para evitar. */
const FLASH_TANKS = [
  { modelo: 'VD13-5', th: 5, cap: 125, H: 1920, H1: 530, H2: 400, L: 350, L1: 240, L2: 200, cI: 80, cII: 100, cIII: 50, cIV: 20, cV: 40, peso: 120 },
  { modelo: 'VD13-10', th: 10, cap: 470, H: 2400, H1: 700, H2: 500, L: 600, L1: 240, L2: 200, cI: 100, cII: 125, cIII: 80, cIV: 25, cV: 40, peso: 250 },
  { modelo: 'VD13-20', th: 20, cap: 910, H: 2725, H1: 785, H2: 500, L: 800, L1: 250, L2: 200, cI: 125, cII: 150, cIII: 100, cIV: 32, cV: 50, peso: 450 },
  { modelo: 'VD13-40', th: 40, cap: 1480, H: 2865, H1: 825, H2: 600, L: 1000, L1: 280, L2: 200, cI: 200, cII: 300, cIII: 125, cIV: 50, cV: 50, peso: 720 },
];
function flashSelTank(vCon) { const th = vCon / 1000; for (const t of FLASH_TANKS) if (t.th >= th - 1e-9) return t; return null; }
function computeFlash(inputs = {}) {
  const KCAL = 4.1868;
  const vCon = Number(inputs.vCon), Palim = Number(inputs.Palim), Preev = Number(inputs.Preev);
  let Pcon = Number(inputs.Pcon); if (isNaN(Pcon)) Pcon = 0;
  if ([vCon, Palim, Preev].some(isNaN) || vCon <= 0 || Palim <= Preev) return { invalid: true };
  const hf1 = steamHl(Palim), hf2 = steamHl(Preev), hg2 = steamHg(Preev), hfg2 = hg2 - hf2, hg1 = steamHg(Palim);
  const x = (hf1 - hf2) / hfg2, vFlash = x * vCon, vDren = vCon - vFlash;
  const tank = flashSelTank(vCon), dPdren = Preev - Pcon;
  const en_kcal = vFlash * hfg2 / KCAL;
  const hfg3 = (steamHg(3) - steamHl(3)) / KCAL, eqVapor = en_kcal / hfg3;
  const PCI = Number(inputs.PCI), rho = Number(inputs.rho);
  const precoRaw = Number(inputs.precoRaw), precoUn = inputs.precoUn || 'm3';
  const preco = isNaN(precoRaw) ? NaN : (precoUn === 'kg' ? precoRaw * rho : (precoUn === 'ton' ? precoRaw * rho / 1000 : precoRaw));
  const hd = isNaN(Number(inputs.hd)) ? 0 : Number(inputs.hd), dm = isNaN(Number(inputs.dm)) ? 0 : Number(inputs.dm);
  const inv = Number(inputs.inv), co2 = Number(inputs.co2);
  const combKgh = (!isNaN(PCI) && PCI > 0) ? en_kcal / PCI : null;
  const combM3h = (combKgh != null && !isNaN(rho) && rho > 0) ? combKgh / rho : null;
  const vDia = eqVapor * hd, vMes = vDia * dm, vAno = vMes * 12;
  const combDiaM3 = (combM3h != null) ? combM3h * hd : null, combMesM3 = (combDiaM3 != null) ? combDiaM3 * dm : null, combAnoM3 = (combMesM3 != null) ? combMesM3 * 12 : null;
  const ecoDia = (combDiaM3 != null && !isNaN(preco)) ? combDiaM3 * preco : null, ecoMes = (combMesM3 != null && !isNaN(preco)) ? combMesM3 * preco : null, ecoAno = (combAnoM3 != null && !isNaN(preco)) ? combAnoM3 * preco : null;
  const amort = (ecoMes != null && ecoMes > 0 && !isNaN(inv)) ? inv / ecoMes : null;
  const co2Dia = (combKgh != null && !isNaN(co2)) ? combKgh * hd * co2 : null, co2MesTon = (co2Dia != null) ? co2Dia * dm / 1000 : null, co2AnoTon = (co2MesTon != null) ? co2MesTon * 12 : null;
  return {
    invalid: false, vCon, Palim, Preev, Pcon, hf1, hf2, hg2, hg1, hfg2, x, vFlash, vDren, tank, dPdren,
    PCI, rho, preco, co2, hd, dm, inv, en_kcal, eqVapor, combKgh, combM3h, vDia, vMes, vAno,
    combDiaM3, combMesM3, combAnoM3, ecoDia, ecoMes, ecoAno, amort, co2Dia, co2MesTon, co2AnoTon,
  };
}

/* ===================== ESTUDO DESSUPERAQUECIMENTO NH3 =====================
   MB.nh3 (tabelas CoolProp/IIR de saturação e superaquecido) é catálogo proprietário
   ESTÁTICO, sem admin — copiado verbatim. `stale` (qual campo de água foi editado por
   último) e `_wOrder` são estado de UI puro — o cliente decide/envia qual campo resolver. */
const NH3SAT = [
  [-40, 0.7163, 18.9, 1408.1, 0.2858, 6.2441], [-39, 0.7556, 23.4, 1409.7, 0.3048, 6.2254], [-38, 0.7965, 27.8, 1411.3, 0.3237, 6.2068], [-37, 0.8393, 32.3, 1412.8, 0.3426, 6.1885], [-36, 0.8839, 36.7, 1414.3, 0.3614, 6.1703], [-35, 0.9304, 41.2, 1415.9, 0.3801, 6.1523], [-34, 0.9789, 45.7, 1417.4, 0.3988, 6.1345], [-33, 1.0294, 50.1, 1418.9, 0.4174, 6.1169], [-32, 1.0820, 54.6, 1420.4, 0.4360, 6.0995], [-31, 1.1368, 59.1, 1421.8, 0.4545, 6.0822],
  [-30, 1.1938, 63.6, 1423.3, 0.4729, 6.0651], [-29, 1.2530, 68.1, 1424.8, 0.4913, 6.0482], [-28, 1.3146, 72.5, 1426.2, 0.5096, 6.0314], [-27, 1.3786, 77.0, 1427.7, 0.5278, 6.0148], [-26, 1.4451, 81.5, 1429.1, 0.5460, 5.9984], [-25, 1.5142, 86.0, 1430.5, 0.5641, 5.9821], [-24, 1.5859, 90.5, 1431.9, 0.5822, 5.9660], [-23, 1.6603, 95.1, 1433.3, 0.6002, 5.9500], [-22, 1.7374, 99.6, 1434.7, 0.6182, 5.9342], [-21, 1.8174, 104.1, 1436.1, 0.6361, 5.9186],
  [-20, 1.9003, 108.6, 1437.4, 0.6540, 5.9030], [-19, 1.9861, 113.1, 1438.8, 0.6717, 5.8876], [-18, 2.0751, 117.7, 1440.1, 0.6895, 5.8724], [-17, 2.1672, 122.2, 1441.4, 0.7072, 5.8573], [-16, 2.2625, 126.7, 1442.7, 0.7248, 5.8423], [-15, 2.3611, 131.3, 1444.0, 0.7424, 5.8275], [-14, 2.4631, 135.8, 1445.3, 0.7599, 5.8128], [-13, 2.5685, 140.4, 1446.6, 0.7774, 5.7982], [-12, 2.6775, 144.9, 1447.8, 0.7948, 5.7838], [-11, 2.7901, 149.5, 1449.0, 0.8122, 5.7694],
  [-10, 2.9064, 154.1, 1450.3, 0.8295, 5.7552], [-9, 3.0265, 158.6, 1451.5, 0.8467, 5.7411], [-8, 3.1505, 163.2, 1452.7, 0.8640, 5.7272], [-7, 3.2784, 167.8, 1453.9, 0.8811, 5.7133], [-6, 3.4104, 172.4, 1455.0, 0.8983, 5.6996], [-5, 3.5466, 177.0, 1456.2, 0.9153, 5.6859], [-4, 3.6869, 181.6, 1457.3, 0.9324, 5.6724], [-3, 3.8316, 186.2, 1458.5, 0.9493, 5.6590], [-2, 3.9807, 190.8, 1459.6, 0.9663, 5.6457], [-1, 4.1343, 195.4, 1460.7, 0.9832, 5.6325],
  [0, 4.2925, 200.0, 1461.8, 1.0000, 5.6193], [1, 4.4554, 204.6, 1462.8, 1.0168, 5.6063], [2, 4.6230, 209.3, 1463.9, 1.0336, 5.5934], [3, 4.7955, 213.9, 1464.9, 1.0503, 5.5806], [4, 4.9730, 218.5, 1466.0, 1.0669, 5.5678], [5, 5.1556, 223.2, 1467.0, 1.0836, 5.5552], [6, 5.3433, 227.8, 1467.9, 1.1002, 5.5426], [7, 5.5363, 232.5, 1468.9, 1.1167, 5.5302], [8, 5.7347, 237.1, 1469.9, 1.1332, 5.5178], [9, 5.9385, 241.8, 1470.8, 1.1497, 5.5055],
  [10, 6.1479, 246.5, 1471.7, 1.1661, 5.4933], [11, 6.3630, 251.2, 1472.6, 1.1825, 5.4811], [12, 6.5838, 255.9, 1473.5, 1.1988, 5.4691], [13, 6.8105, 260.6, 1474.4, 1.2152, 5.4571], [14, 7.0431, 265.3, 1475.2, 1.2314, 5.4452], [15, 7.2819, 270.0, 1476.1, 1.2477, 5.4333], [16, 7.5268, 274.7, 1476.9, 1.2639, 5.4215], [17, 7.7780, 279.4, 1477.7, 1.2801, 5.4098], [18, 8.0356, 284.2, 1478.4, 1.2962, 5.3982], [19, 8.2997, 288.9, 1479.2, 1.3123, 5.3866],
  [20, 8.5704, 293.6, 1479.9, 1.3284, 5.3751], [21, 8.8478, 298.4, 1480.7, 1.3444, 5.3637], [22, 9.1321, 303.2, 1481.4, 1.3604, 5.3523], [23, 9.4233, 307.9, 1482.0, 1.3764, 5.3409], [24, 9.7215, 312.7, 1482.7, 1.3924, 5.3297], [25, 10.0269, 317.5, 1483.3, 1.4083, 5.3184], [26, 10.3396, 322.3, 1483.9, 1.4242, 5.3073], [27, 10.6597, 327.1, 1484.5, 1.4400, 5.2961], [28, 10.9873, 331.9, 1485.1, 1.4558, 5.2851], [29, 11.3225, 336.7, 1485.6, 1.4716, 5.2741],
  [30, 11.6654, 341.6, 1486.2, 1.4874, 5.2631], [31, 12.0161, 346.4, 1486.7, 1.5032, 5.2521], [32, 12.3748, 351.3, 1487.1, 1.5189, 5.2413], [33, 12.7416, 356.1, 1487.6, 1.5346, 5.2304], [34, 13.1166, 361.0, 1488.0, 1.5503, 5.2196], [35, 13.4999, 365.9, 1488.4, 1.5659, 5.2088], [36, 13.8917, 370.8, 1488.8, 1.5816, 5.1981], [37, 14.2919, 375.7, 1489.2, 1.5972, 5.1874], [38, 14.7009, 380.6, 1489.5, 1.6128, 5.1767], [39, 15.1187, 385.5, 1489.8, 1.6283, 5.1661],
  [40, 15.5453, 390.4, 1490.1, 1.6439, 5.1555], [41, 15.9810, 395.4, 1490.4, 1.6594, 5.1449], [42, 16.4259, 400.4, 1490.6, 1.6749, 5.1343], [43, 16.8801, 405.3, 1490.8, 1.6904, 5.1238], [44, 17.3436, 410.3, 1491.0, 1.7059, 5.1133], [45, 17.8167, 415.3, 1491.1, 1.7214, 5.1028], [46, 18.2995, 420.3, 1491.2, 1.7368, 5.0924], [47, 18.7921, 425.3, 1491.3, 1.7522, 5.0819], [48, 19.2945, 430.4, 1491.4, 1.7677, 5.0715], [49, 19.8070, 435.4, 1491.4, 1.7831, 5.0611],
  [50, 20.3297, 440.5, 1491.4, 1.7985, 5.0507], [51, 20.8627, 445.5, 1491.4, 1.8139, 5.0403], [52, 21.4061, 450.6, 1491.3, 1.8292, 5.0299], [53, 21.9601, 455.7, 1491.2, 1.8446, 5.0195], [54, 22.5248, 460.8, 1491.1, 1.8599, 5.0092], [55, 23.1003, 466.0, 1491.0, 1.8753, 4.9988],
];
const NH3SUP = {
  tsats: [-40, -35, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55], dts: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140],
  h: [
    [1408.1, 1430.2, 1452.0, 1473.6, 1495.0, 1516.4, 1537.7, 1559.1, 1580.6, 1602.2, 1623.9, 1645.7, 1667.6, 1689.8, 1712.0],
    [1415.9, 1438.4, 1460.5, 1482.3, 1504.0, 1525.6, 1547.1, 1568.7, 1590.4, 1612.1, 1633.9, 1655.9, 1678.0, 1700.2, 1722.6],
    [1423.3, 1446.3, 1468.7, 1490.9, 1512.8, 1534.6, 1556.4, 1578.2, 1600.0, 1621.9, 1643.9, 1666.0, 1688.2, 1710.6, 1733.2],
    [1430.5, 1453.9, 1476.8, 1499.2, 1521.5, 1543.5, 1565.5, 1587.5, 1609.5, 1631.6, 1653.8, 1676.0, 1698.4, 1721.0, 1743.6],
    [1437.4, 1461.3, 1484.6, 1507.4, 1529.9, 1552.3, 1574.5, 1596.7, 1618.9, 1641.2, 1663.5, 1686.0, 1708.5, 1731.2, 1754.1],
    [1444.0, 1468.4, 1492.2, 1515.4, 1538.2, 1560.8, 1583.3, 1605.8, 1628.2, 1650.7, 1673.2, 1695.8, 1718.5, 1741.4, 1764.4],
    [1450.3, 1475.3, 1499.5, 1523.1, 1546.3, 1569.2, 1592.0, 1614.7, 1637.3, 1660.0, 1682.7, 1705.5, 1728.4, 1751.5, 1774.6],
    [1456.2, 1481.8, 1506.5, 1530.6, 1554.1, 1577.4, 1600.4, 1623.4, 1646.3, 1669.2, 1692.1, 1715.1, 1738.2, 1761.4, 1784.8],
    [1461.8, 1488.1, 1513.3, 1537.8, 1561.7, 1585.3, 1608.7, 1631.9, 1655.1, 1678.2, 1701.4, 1724.6, 1747.9, 1771.3, 1794.8],
    [1467.0, 1494.0, 1519.8, 1544.7, 1569.1, 1593.0, 1616.7, 1640.2, 1663.7, 1687.0, 1710.4, 1733.9, 1757.4, 1781.0, 1804.7],
    [1471.7, 1499.5, 1525.9, 1551.4, 1576.2, 1600.5, 1624.5, 1648.3, 1672.1, 1695.7, 1719.3, 1743.0, 1766.7, 1790.5, 1814.4],
    [1476.1, 1504.6, 1531.7, 1557.7, 1582.9, 1607.7, 1632.1, 1656.2, 1680.2, 1704.2, 1728.1, 1752.0, 1775.9, 1799.9, 1824.1],
    [1479.9, 1509.3, 1537.1, 1563.7, 1589.4, 1614.6, 1639.4, 1663.9, 1688.2, 1712.4, 1736.6, 1760.7, 1784.9, 1809.2, 1833.5],
    [1483.3, 1513.6, 1542.1, 1569.3, 1595.6, 1621.2, 1646.4, 1671.2, 1695.9, 1720.4, 1744.9, 1769.3, 1793.8, 1818.3, 1842.8],
    [1486.2, 1517.5, 1546.7, 1574.5, 1601.4, 1627.5, 1653.1, 1678.3, 1703.4, 1728.2, 1753.0, 1777.7, 1802.4, 1827.2, 1852.0],
    [1488.4, 1520.8, 1550.9, 1579.4, 1606.8, 1633.4, 1659.5, 1685.2, 1710.6, 1735.8, 1760.8, 1785.9, 1810.9, 1835.9, 1860.9],
    [1490.1, 1523.6, 1554.6, 1583.9, 1611.9, 1639.1, 1665.6, 1691.7, 1717.5, 1743.1, 1768.5, 1793.8, 1819.1, 1844.4, 1869.7],
    [1491.1, 1525.9, 1557.9, 1587.9, 1616.6, 1644.3, 1671.4, 1697.9, 1724.1, 1750.1, 1775.9, 1801.5, 1827.1, 1852.7, 1878.3],
    [1491.4, 1527.6, 1560.6, 1591.5, 1620.9, 1649.2, 1676.8, 1703.9, 1730.5, 1756.8, 1783.0, 1809.0, 1834.9, 1860.8, 1886.7],
    [1491.0, 1528.7, 1562.8, 1594.6, 1624.8, 1653.7, 1681.9, 1709.4, 1736.5, 1763.3, 1789.8, 1816.2, 1842.5, 1868.7, 1894.8],
  ],
  s: [
    [6.2441, 6.3370, 6.4247, 6.5082, 6.5882, 6.6650, 6.7392, 6.8110, 6.8807, 6.9485, 7.0145, 7.0791, 7.1421, 7.2039, 7.2644],
    [6.1523, 6.2449, 6.3322, 6.4152, 6.4946, 6.5708, 6.6444, 6.7156, 6.7847, 6.8519, 6.9175, 6.9815, 7.0441, 7.1053, 7.1654],
    [6.0651, 6.1575, 6.2446, 6.3272, 6.4061, 6.4818, 6.5548, 6.6255, 6.6941, 6.7608, 6.8259, 6.8894, 6.9515, 7.0123, 7.0719],
    [5.9821, 6.0746, 6.1614, 6.2437, 6.3222, 6.3975, 6.4701, 6.5403, 6.6084, 6.6747, 6.7393, 6.8023, 6.8640, 6.9244, 6.9836],
    [5.9030, 5.9956, 6.0824, 6.1645, 6.2427, 6.3177, 6.3899, 6.4596, 6.5273, 6.5932, 6.6573, 6.7200, 6.7813, 6.8413, 6.9001],
    [5.8275, 5.9204, 6.0072, 6.0892, 6.1672, 6.2418, 6.3137, 6.3831, 6.4504, 6.5159, 6.5797, 6.6420, 6.7029, 6.7625, 6.8210],
    [5.7552, 5.8486, 5.9355, 6.0175, 6.0953, 6.1697, 6.2413, 6.3104, 6.3774, 6.4426, 6.5060, 6.5680, 6.6285, 6.6879, 6.7460],
    [5.6859, 5.7798, 5.8671, 5.9490, 6.0268, 6.1011, 6.1724, 6.2413, 6.3080, 6.3728, 6.4360, 6.4977, 6.5579, 6.6170, 6.6748],
    [5.6193, 5.7139, 5.8015, 5.8836, 5.9614, 6.0355, 6.1067, 6.1754, 6.2419, 6.3065, 6.3694, 6.4308, 6.4908, 6.5496, 6.6072],
    [5.5552, 5.6506, 5.7386, 5.8210, 5.8988, 5.9729, 6.0440, 6.1126, 6.1789, 6.2433, 6.3060, 6.3671, 6.4269, 6.4855, 6.5428],
    [5.4933, 5.5896, 5.6782, 5.7608, 5.8388, 5.9130, 5.9841, 6.0525, 6.1187, 6.1829, 6.2454, 6.3064, 6.3660, 6.4243, 6.4815],
    [5.4333, 5.5307, 5.6200, 5.7030, 5.7812, 5.8555, 5.9266, 5.9950, 6.0611, 6.1252, 6.1876, 6.2484, 6.3079, 6.3660, 6.4230],
    [5.3751, 5.4737, 5.5638, 5.6473, 5.7258, 5.8003, 5.8714, 5.9399, 6.0059, 6.0700, 6.1323, 6.1930, 6.2523, 6.3103, 6.3671],
    [5.3184, 5.4185, 5.5094, 5.5935, 5.6724, 5.7471, 5.8184, 5.8869, 5.9530, 6.0170, 6.0792, 6.1399, 6.1991, 6.2569, 6.3136],
    [5.2631, 5.3647, 5.4567, 5.5415, 5.6208, 5.6958, 5.7673, 5.8359, 5.9021, 5.9661, 6.0283, 6.0889, 6.1481, 6.2059, 6.2624],
    [5.2088, 5.3122, 5.4054, 5.4910, 5.5709, 5.6463, 5.7180, 5.7868, 5.8531, 5.9172, 5.9794, 6.0400, 6.0991, 6.1568, 6.2134],
    [5.1555, 5.2609, 5.3554, 5.4419, 5.5224, 5.5983, 5.6704, 5.7394, 5.8058, 5.8700, 5.9323, 5.9929, 6.0520, 6.1097, 6.1662],
    [5.1028, 5.2105, 5.3065, 5.3941, 5.4753, 5.5517, 5.6242, 5.6935, 5.7602, 5.8245, 5.8869, 5.9476, 6.0067, 6.0644, 6.1209],
    [5.0507, 5.1610, 5.2586, 5.3474, 5.4295, 5.5065, 5.5794, 5.6491, 5.7160, 5.7805, 5.8430, 5.9038, 5.9630, 6.0207, 6.0772],
    [4.9988, 5.1120, 5.2116, 5.3016, 5.3847, 5.4624, 5.5359, 5.6059, 5.6731, 5.7379, 5.8006, 5.8615, 5.9208, 5.9786, 6.0351],
  ],
};
const NH3RHOG = [0.6436, 0.6765, 0.7107, 0.7463, 0.7833, 0.8218, 0.8617, 0.9032, 0.9463, 0.9911, 1.0374, 1.0856, 1.1354, 1.1871, 1.2406, 1.2961, 1.3535, 1.4128, 1.4743, 1.5378, 1.6035, 1.6714, 1.7416, 1.8140, 1.8889, 1.9661, 2.0458, 2.1281, 2.2130, 2.3005, 2.3907, 2.4837, 2.5796, 2.6783, 2.7800, 2.8847, 2.9925, 3.1035, 3.2177, 3.3352, 3.4560, 3.5803, 3.7081, 3.8395, 3.9745, 4.1133, 4.2558, 4.4023, 4.5527, 4.7071, 4.8657, 5.0285, 5.1956, 5.3671, 5.5431, 5.7236, 5.9088, 6.0987, 6.2935, 6.4932, 6.6980, 6.9078, 7.1230, 7.3435, 7.5694, 7.8009, 8.0381, 8.2811, 8.5300, 8.7849, 9.0460, 9.3133, 9.5871, 9.8673, 10.1543, 10.4480, 10.7487, 11.0565, 11.3715, 11.6939, 12.0238, 12.3614, 12.7069, 13.0604, 13.4221, 13.7922, 14.1708, 14.5582, 14.9545, 15.3599, 15.7746, 16.1989, 16.6329, 17.0769, 17.5311, 17.9958];
const NH3SUP_D = [
  [0.6436, 0.6146, 0.5884, 0.5647, 0.5430, 0.5230, 0.5045, 0.4874, 0.4714, 0.4565, 0.4426, 0.4294, 0.4171, 0.4055, 0.3945],
  [0.8218, 0.7849, 0.7517, 0.7216, 0.6941, 0.6688, 0.6454, 0.6237, 0.6035, 0.5846, 0.5669, 0.5503, 0.5347, 0.5199, 0.5060],
  [1.0374, 0.9910, 0.9493, 0.9116, 0.8771, 0.8454, 0.8161, 0.7889, 0.7636, 0.7399, 0.7177, 0.6969, 0.6773, 0.6588, 0.6413],
  [1.2961, 1.2381, 1.1862, 1.1392, 1.0963, 1.0570, 1.0206, 0.9869, 0.9555, 0.9262, 0.8987, 0.8728, 0.8484, 0.8255, 0.8037],
  [1.6035, 1.5316, 1.4675, 1.4096, 1.3568, 1.3083, 1.2636, 1.2222, 1.1836, 1.1475, 1.1137, 1.0819, 1.0520, 1.0237, 0.9970],
  [1.9661, 1.8777, 1.7990, 1.7280, 1.6635, 1.6044, 1.5498, 1.4993, 1.4522, 1.4082, 1.3670, 1.3283, 1.2918, 1.2574, 1.2248],
  [2.3907, 2.2826, 2.1866, 2.1003, 2.0220, 1.9503, 1.8842, 1.8230, 1.7661, 1.7129, 1.6631, 1.6163, 1.5722, 1.5306, 1.4912],
  [2.8847, 2.7531, 2.6368, 2.5326, 2.4381, 2.3517, 2.2722, 2.1987, 2.1302, 2.0664, 2.0066, 1.9504, 1.8975, 1.8476, 1.8003],
  [3.4560, 3.2967, 3.1565, 3.0312, 2.9178, 2.8144, 2.7194, 2.6315, 2.5498, 2.4736, 2.4023, 2.3354, 2.2723, 2.2128, 2.1565],
  [4.1133, 3.9212, 3.7529, 3.6030, 3.4678, 3.3446, 3.2315, 3.1272, 3.0303, 2.9399, 2.8554, 2.7761, 2.7014, 2.6310, 2.5644],
  [4.8657, 4.6351, 4.4339, 4.2553, 4.0947, 3.9487, 3.8150, 3.6916, 3.5772, 3.4707, 3.3711, 3.2777, 3.1898, 3.1069, 3.0285],
  [5.7236, 5.4474, 5.2077, 4.9959, 4.8059, 4.6336, 4.4761, 4.3310, 4.1967, 4.0716, 3.9549, 3.8454, 3.7425, 3.6454, 3.5538],
  [6.6980, 6.3680, 6.0834, 5.8329, 5.6090, 5.4065, 5.2217, 5.0518, 4.8947, 4.7487, 4.6124, 4.4848, 4.3649, 4.2519, 4.1451],
  [7.8009, 7.4075, 7.0704, 6.7751, 6.5121, 6.2749, 6.0590, 5.8609, 5.6779, 5.5081, 5.3497, 5.2015, 5.0624, 4.9314, 4.8078],
  [9.0460, 8.5776, 8.1791, 7.8319, 7.5238, 7.2470, 6.9955, 6.7652, 6.5529, 6.3561, 6.1729, 6.0016, 5.8409, 5.6896, 5.5470],
  [10.4480, 9.8909, 9.4207, 9.0133, 8.6534, 8.3311, 8.0391, 7.7722, 7.5268, 7.2996, 7.0883, 6.8909, 6.7060, 6.5322, 6.3683],
  [12.0238, 11.3615, 10.8073, 10.3301, 9.9106, 9.5362, 9.1981, 8.8899, 8.6069, 8.3454, 8.1026, 7.8761, 7.6640, 7.4649, 7.2773],
  [13.7922, 13.0047, 12.3521, 11.7940, 11.3059, 10.8720, 10.4814, 10.1263, 9.8009, 9.5009, 9.2227, 8.9635, 8.7212, 8.4938, 8.2798],
  [15.7746, 14.8376, 14.0695, 13.4175, 12.8505, 12.3486, 11.8983, 11.4902, 11.1171, 10.7737, 10.4558, 10.1602, 9.8840, 9.6253, 9.3819],
  [17.9958, 16.8796, 15.9755, 15.2144, 14.5565, 13.9769, 13.4588, 12.9907, 12.5638, 12.1717, 11.8095, 11.4731, 11.1594, 10.8657, 10.5898],
];
function nh3Sat(T) {
  const A = NH3SAT;
  if (T <= A[0][0]) { const r = A[0]; return { P: r[1], hf: r[2], hg: r[3], sf: r[4], sg: r[5] }; }
  if (T >= A[A.length - 1][0]) { const q = A[A.length - 1]; return { P: q[1], hf: q[2], hg: q[3], sf: q[4], sg: q[5] }; }
  const i = Math.floor(T) - A[0][0], a = A[i], b = A[i + 1], f = (T - a[0]) / (b[0] - a[0]);
  const L = k => a[k] + f * (b[k] - a[k]);
  return { P: L(1), hf: L(2), hg: L(3), sf: L(4), sg: L(5) };
}
function nh3SupGrid(Tsat, dT, G) {
  const ts = NH3SUP.tsats, ds = NH3SUP.dts;
  let i = 0; while (i < ts.length - 2 && Tsat > ts[i + 1]) i++;
  let j = 0; while (j < ds.length - 2 && dT > ds[j + 1]) j++;
  const fx = Math.min(Math.max((Tsat - ts[i]) / (ts[i + 1] - ts[i]), 0), 1);
  const fy = Math.min(Math.max((dT - ds[j]) / (ds[j + 1] - ds[j]), 0), 1);
  const g00 = G[i][j], g10 = G[i + 1][j], g01 = G[i][j + 1], g11 = G[i + 1][j + 1];
  return g00 * (1 - fx) * (1 - fy) + g10 * fx * (1 - fy) + g01 * (1 - fx) * fy + g11 * fx * fy;
}
function nh3SupH(Tsat, dT) { return nh3SupGrid(Tsat, dT, NH3SUP.h); }
function nh3SupS(Tsat, dT) { return nh3SupGrid(Tsat, dT, NH3SUP.s); }
function nh3Descarga(Tevap, Tcond, etaIso) {
  const e = (etaIso && etaIso > 0 && etaIso <= 1) ? etaIso : 0.70;
  const s1 = nh3Sat(Tevap).sg, h1 = nh3Sat(Tevap).hg;
  let lo = 0, hi = 140;
  if (nh3SupS(Tcond, 0) >= s1) { lo = 0; hi = 0; }
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; (nh3SupS(Tcond, mid) < s1) ? (lo = mid) : (hi = mid); }
  const dTs = (lo + hi) / 2, h2s = nh3SupH(Tcond, dTs);
  const h2 = h1 + (h2s - h1) / e;
  lo = 0; hi = 140;
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; (nh3SupH(Tcond, mid) < h2) ? (lo = mid) : (hi = mid); }
  const dT2 = (lo + hi) / 2;
  return { T2: Tcond + dT2, h2, h2s, dTs, h1, s1 };
}
function nh3RhogSat(T) { const A = NH3RHOG, t0 = -40; if (T <= t0) return A[0]; if (T >= t0 + A.length - 1) return A[A.length - 1]; const i = Math.floor(T) - t0, f = T - Math.floor(T); return A[i] + f * (A[i + 1] - A[i]); }
function nh3RhoSup(Tsat, dT) { return nh3SupGrid(Tsat, dT, NH3SUP_D); }
function nh3VolFlow(mdot_kgh, Tsat, dT) { const rho = (dT && dT > 0.01) ? nh3RhoSup(Tsat, dT) : nh3RhogSat(Tsat); return rho > 0 ? mdot_kgh / rho : null; }

const CPW = 4.186;
function _dessuperCalcComp(c, Tc1, Tc2) {
  const st = nh3Sat(c.tevap), sc1 = nh3Sat(Tc1), sc2 = nh3Sat(Tc2);
  const h1 = st.hg, h41 = sc1.hf, h42 = sc2.hf;
  if (!(c.qkw > 0) || !(h1 > h41)) return null;
  const mdot = c.qkw / (h1 - h41) * 3600;
  const d1 = nh3Descarga(c.tevap, Tc1, c.eta);
  let T2, h2, etaEff = c.eta;
  if (c.t2man != null && isFinite(c.t2man) && c.t2man > Tc1) {
    T2 = c.t2man; h2 = nh3SupH(Tc1, T2 - Tc1);
    if (h2 > h1) etaEff = Math.min(1, Math.max(0.3, (d1.h2s - h1) / (h2 - h1)));
  } else { T2 = d1.T2; h2 = d1.h2; }
  const d2 = nh3Descarga(c.tevap, Tc2, etaEff);
  return { mdot, T2, h2, etaEff, cop1: (h1 - h41) / (h2 - h1), cop2: (h1 - h42) / (d2.h2 - h1), h1 };
}
function computeDessuper(inputs = {}) {
  const comps = Array.isArray(inputs.comps) ? inputs.comps : [];
  const Tc1 = comps.length ? Number(comps[0].tcond) : Number(inputs.dsCTcond);
  const Tc2 = Number(inputs.tcond2);
  if (isNaN(Tc1) || isNaN(Tc2)) return { invalid: true };
  const _tds = Number(inputs.tds);
  const Tds = (isFinite(_tds) && _tds > Tc1) ? _tds : Tc1;
  const hout = (Tds > Tc1 + 0.01) ? nh3SupH(Tc1, Tds - Tc1) : nh3Sat(Tc1).hg;
  const rows = []; let mtot = 0, qrec = 0, t2w = 0, qtot = 0, w1 = 0, w2 = 0, t2dtw = 0;
  for (const c of comps) {
    const r = _dessuperCalcComp(c, Tc1, Tc2); if (!r) continue;
    rows.push({ c, r });
    mtot += r.mdot; qtot += c.qkw; t2w += r.T2 * r.mdot;
    qrec += (r.mdot / 3600) * Math.max(0, r.h2 - hout);
    t2dtw += (r.T2 - Tc1) * r.mdot;
    w1 += c.qkw / r.cop1; w2 += c.qkw / r.cop2;
  }
  if (!rows.length) return { invalid: false, empty: true, S: { Tc1, Tc2, Tds, rows: [], mtot: 0, qtot: 0, qrec: 0, t2m: null, dtm: 0, w1: 0, w2: 0 } };
  const S = { Tc1, Tc2, Tds, rows, mtot, qtot, qrec, t2m: mtot > 0 ? t2w / mtot : null, dtm: mtot > 0 ? t2dtw / mtot : 0, w1, w2 };

  // água quente (resolve o campo "obsoleto" indicado pelo cliente: flow/tin/tout)
  let wat = null;
  const stale = inputs.wStale || 'tin';
  const mw = Number(inputs.wMw), tin = Number(inputs.wTin); let tout = Number(inputs.wTout);
  if (S.qrec > 0) {
    if (isFinite(tout) && S.t2m != null && tout > S.t2m) tout = S.t2m;
    if (stale === 'flow') {
      if (tout > tin) { const v = S.qrec / (CPW * (tout - tin)) * 3600; wat = { mode: 'flow', mw: v, tin, tout }; }
    } else if (stale === 'tout') {
      if (mw > 0) wat = { mode: 'tout', mw, tin, tout: Math.min(tin + S.qrec / ((mw / 3600) * CPW), (S.t2m != null ? S.t2m : Infinity)) };
    } else {
      if (mw > 0) wat = { mode: 'tin', mw, tout, tin: tout - S.qrec / ((mw / 3600) * CPW) };
    }
  }

  const peq = Number(inputs.peq) > 0 ? Number(inputs.peq) : 10;
  const hfg = steamHg(peq) - steamHl(peq);
  const mvap = (hfg && hfg > 0) ? S.qrec * 3600 / hfg : null;
  const horas = Number(inputs.horas) || 0, dias = Number(inputs.dias) || 0, tarifa = Number(inputs.tarifa) || 0, cvap = Number(inputs.cvap);
  const hmes = horas * dias;
  const tvapmes = (mvap != null) ? mvap * hmes / 1000 : null;
  const ecoT = (tvapmes != null && cvap > 0) ? tvapmes * cvap : null;
  const ecoE = (S.w1 > S.w2) ? (S.w1 - S.w2) * hmes * tarifa : 0;
  const inv = Number(inputs.inv);
  const ecoTot = (ecoT || 0) + ecoE;
  const dkwh = (S.w1 > S.w2) ? (S.w1 - S.w2) * hmes : 0;
  const fv = Number(inputs.co2v) || 0, fe = Number(inputs.co2e) || 0;
  const co2 = ((tvapmes || 0) * fv + (dkwh / 1000) * fe) / 1000;
  const pay = (inv > 0 && ecoTot > 0) ? inv / ecoTot : null;
  const volNH3 = nh3VolFlow(S.mtot, S.Tc1, 0);

  return { invalid: false, empty: false, S, wat, peq, hfg, mvap, horas, dias, tvapmes, ecoT, ecoE, ecoTot, dkwh, co2, pay, inv, volNH3 };
}

export {
  ENG, VALV, SCHED, CVANG, CVANG_DEG, VB_PT, AGUA_MODELS, VDB,
  interp, interpC, vaporVol, vaporTemp, vaporPress, ATM,
  cvReq, parseInch, vaporVolWet, sortedSizes, pmaxValv, aberturaFrac,
  valveAbas, modelsForTabAll, steamLookup, isBorboleta,
  vaporVolSup, khSup, RHO_AR_N, arRho, arWmass, xtDefault, arXt, cvReqAr,
  aguaRho, aguaRhoT, aguaSG, aguaDpChoked, cvReqAgua, fluxoAgua, aguaVol,
  computePurg, computePSV,
  steamHg, steamHl, pipeArea,
  FLUIDS_BASE, INJECTORS_BASE, injCap, computeTanque,
  bicoQ, computeBicoInj,
  rOfT, tOfR, computeSensorTemp,
  VTYPE, PIPE_NPS, PIPE_SCH_KEYS, velocityMatrix, computeVeloc, computeCondens,
  computeResTubo,
  computePerdaTub,
  computeEfluente,
  computeCustoVap,
  computeTubVapor,
  computeTubAgua,
  computeFlash,
  computeDessuper,
};
