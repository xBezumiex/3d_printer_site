// App.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Upload, Calculator, Package, Clock, CheckCircle, Menu, X, Eye } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const App = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [orderForm, setOrderForm] = useState({ name: '', email: '', phone: '', comments: '' });
  const [calcParams, setCalcParams] = useState({ material: 'pla', quality: 'standard', infill: 20, quantity: 1, volume: 0, weight: 0 });
  const [price, setPrice] = useState(0);

  // three refs
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const modelRef = useRef(null);

  const materials = {
    pla: { name: 'PLA', pricePerG: 0.03, density: 1.24 },
    abs: { name: 'ABS', pricePerG: 0.035, density: 1.04 },
    petg: { name: 'PETG', pricePerG: 0.04, density: 1.27 },
    tpu: { name: 'TPU (гибкий)', pricePerG: 0.06, density: 1.21 },
    nylon: { name: 'Nylon', pricePerG: 0.07, density: 1.14 }
  };

  const qualities = {
    draft: { name: 'Черновое (0.3мм)', multiplier: 0.8 },
    standard: { name: 'Стандартное (0.2мм)', multiplier: 1.0 },
    high: { name: 'Высокое (0.1мм)', multiplier: 1.5 },
    ultra: { name: 'Ультра (0.05мм)', multiplier: 2.0 }
  };

  // Инициализация сцены, камеры, рендера и контролов
  useEffect(() => {
    if (sceneRef.current) return; // уже инициализировано

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 0, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    // временный размер — будет скорректирован в другом эффекте
    renderer.setSize(500, 500);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);

    // сохранение в рефы
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.rotateSpeed = 0.8;
    controls.enableZoom = true;
    controls.enablePan = false;
    controlsRef.current = controls;

    // Анимация
    let rafId;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Очистка при демонтировании
    return () => {
      cancelAnimationFrame(rafId);
      controls.dispose();
      renderer.dispose();
      // удалим модель (если есть)
      if (modelRef.current) {
        scene.remove(modelRef.current);
        if (modelRef.current.geometry) modelRef.current.geometry.dispose();
        if (modelRef.current.material) modelRef.current.material.dispose();
        modelRef.current = null;
      }
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  // добавляем canvas в DOM и настраиваем ресайз
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const mount = mountRef.current;
    if (!mount || !renderer || !camera) return;

    // добавить элемент canvas, если ещё не добавлен
    if (!mount.contains(renderer.domElement)) {
      mount.appendChild(renderer.domElement);
    }

    // установить правильный размер и аспект
    const setSize = () => {
      if (!mount) return;
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    setSize();

    window.addEventListener('resize', setSize);
    return () => {
      window.removeEventListener('resize', setSize);
    };
  }, [activeTab, modelLoaded]);

  // Функция отображения модели
  const displayModel = (object3d) => {
    const scene = sceneRef.current;
    if (!scene) {
      console.error('Сцена не инициализирована');
      return;
    }

    // Если приходит Geometry/BufferGeometry — завернём в Mesh
    let mesh;
    if (object3d.isMesh) {
      mesh = object3d;
    } else if (object3d.isBufferGeometry || object3d.isGeometry) {
      mesh = new THREE.Mesh(object3d, new THREE.MeshPhongMaterial({ color: 0x3b82f6, shininess: 30, flatShading: false }));
    } else {
      // если это Group/Object3D (например OBJ или GLTF), найдем первую Mesh внутри
      const firstMesh = object3d.getObjectByProperty ? object3d.getObjectByProperty('type', 'Mesh') : null;
      if (firstMesh) {
        mesh = firstMesh.clone();
      } else {
        // если это группа, просто добавляем её
        mesh = object3d;
      }
    }

    // Удаляем старую модель
    if (modelRef.current) {
      scene.remove(modelRef.current);
      try {
        if (modelRef.current.geometry) modelRef.current.geometry.dispose();
        if (modelRef.current.material) {
          if (Array.isArray(modelRef.current.material)) {
            modelRef.current.material.forEach(m => m?.dispose && m.dispose());
          } else {
            modelRef.current.material.dispose && modelRef.current.material.dispose();
          }
        }
      } catch (e) {
        // игнорируем ошибки очистки
      }
      modelRef.current = null;
    }

    // Если mesh — обычный Mesh, центрируем и масштабируем
    // Для групп тоже вычислим bounding box
    const bbox = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    // сдвинем так, чтобы центр был в (0,0,0)
    mesh.position.sub(center);

    // вычислим размер и масштаб
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 50 / maxDim; // 50 — желаемый "размер"
    mesh.scale.setScalar(scale);

    // если mesh — Group, лучше обернуть в Group чтобы можно было работать единообразно
    let finalObject = mesh;
    if (!mesh.isMesh && !(mesh.isGroup)) {
      const g = new THREE.Group();
      g.add(mesh);
      finalObject = g;
    }

    scene.add(finalObject);
    modelRef.current = finalObject;

    // Рассчитаем объём/вес (приближенно)
    // Используем bbox в уже отмасштабированных координатах
    const scaledSize = size.clone().multiplyScalar(scale);
    const volume = (scaledSize.x * scaledSize.y * scaledSize.z) / 1000; // в условных см^3 (приближенно)
    const weight = volume * materials[calcParams.material].density * (calcParams.infill / 100);

    setCalcParams(prev => ({ ...prev, volume: volume.toFixed(2), weight: weight.toFixed(2) }));
    setModelLoaded(true);
    calculatePrice();
  };

  // Загрузчики файлов
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const extension = file.name.split('.').pop().toLowerCase();

    const reader = new FileReader();

    reader.onerror = (err) => {
      console.error('File read error', err);
      alert('Ошибка чтения файла');
    };

    try {
      switch (extension) {
        case 'stl':
          // STL — читаем как ArrayBuffer
          reader.onload = (event) => {
            try {
              const arrayBuffer = event.target.result;
              const stlLoader = new STLLoader();
              const geometry = stlLoader.parse(arrayBuffer);
              const material = new THREE.MeshPhongMaterial({ color: 0x3b82f6, shininess: 30 });
              const mesh = new THREE.Mesh(geometry, material);
              displayModel(mesh);
            } catch (err) {
              console.error(err);
              alert('Ошибка парсинга STL: ' + err.message);
            }
          };
          reader.readAsArrayBuffer(file);
          break;

        case 'obj':
          // OBJ — читаем как текст
          reader.onload = (event) => {
            try {
              const text = event.target.result;
              const objLoader = new OBJLoader();
              const obj = objLoader.parse(text);
              displayModel(obj);
            } catch (err) {
              console.error(err);
              alert('Ошибка парсинга OBJ: ' + err.message);
            }
          };
          reader.readAsText(file);
          break;

        case 'ply':
          // PLY — читаем как текст (PLYLoader умеет парсить и ASCII и бинар)
          reader.onload = (event) => {
            try {
              const contents = event.target.result;
              const plyLoader = new PLYLoader();
              // PLYLoader.parse принимает string или ArrayBuffer; попробуем и так, и так
              const geometry = typeof contents === 'string' ? plyLoader.parse(contents) : plyLoader.parse(contents);
              const material = new THREE.MeshPhongMaterial({ color: 0x3b82f6, shininess: 30 });
              const mesh = new THREE.Mesh(geometry, material);
              displayModel(mesh);
            } catch (err) {
              console.error(err);
              alert('Ошибка парсинга PLY: ' + err.message);
            }
          };
          // Лучше читать как ArrayBuffer, но PLY может быть ASCII — читаем ArrayBuffer и передаём в parse
          reader.readAsArrayBuffer(file);
          break;

        case 'gltf':
        case 'glb':
          // GLTF/GLB — используем GLTFLoader
          reader.onload = (event) => {
            try {
              const data = event.target.result;
              const gltfLoader = new GLTFLoader();
              if (extension === 'glb') {
                // ArrayBuffer
                gltfLoader.parse(data, '', (gltf) => {
                  displayModel(gltf.scene || gltf.scenes?.[0] || gltf);
                }, (err) => {
                  console.error(err);
                  alert('Ошибка парсинга GLB: ' + (err.message || err));
                });
              } else {
                // gltf (JSON text) — parse string
                const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
                gltfLoader.parse(text, '', (gltf) => {
                  displayModel(gltf.scene || gltf.scenes?.[0] || gltf);
                }, (err) => {
                  console.error(err);
                  alert('Ошибка парсинга GLTF: ' + (err.message || err));
                });
              }
            } catch (err) {
              console.error(err);
              alert('Ошибка при загрузке GLTF: ' + err.message);
            }
          };
          if (extension === 'glb') reader.readAsArrayBuffer(file);
          else reader.readAsText(file);
          break;

        default:
          alert('Неподдерживаемый формат файла. Поддерживаются: STL, OBJ, PLY, GLTF, GLB');
      }
    } catch (err) {
      console.error(err);
      alert('Ошибка обработки файла: ' + err.message);
    }
  };

  const calculatePrice = () => {
    const { material, quality, infill, quantity, weight } = calcParams;
    if (!weight || parseFloat(weight) <= 0) {
      setPrice(0);
      return;
    }
    const materialCost = parseFloat(weight) * materials[material].pricePerG;
    const qualityCost = materialCost * qualities[quality].multiplier;
    const infillMultiplier = 0.5 + (infill / 100) * 0.5;
    const totalPerItem = qualityCost * infillMultiplier + 200;
    const total = totalPerItem * quantity;
    setPrice(total.toFixed(2));
  };

  useEffect(() => {
    calculatePrice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcParams]);

  const handleCalcChange = (field, value) => {
    setCalcParams(prev => {
      const newParams = { ...prev, [field]: value };
      if (field === 'material' || field === 'infill') {
        // если volume уже есть — пересчитать вес
        const vol = parseFloat(prev.volume) || 0;
        const weight = vol * materials[newParams.material].density * (newParams.infill / 100);
        newParams.weight = isNaN(weight) ? 0 : weight.toFixed(2);
      }
      return newParams;
    });
  };

  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    if (!modelLoaded) {
      alert('Пожалуйста, загрузите 3D модель');
      return;
    }
    try {
      const response = await fetch('https://formsubmit.co/ajax/i43231360@gmail.com', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          name: orderForm.name,
          email: orderForm.email,
          phone: orderForm.phone,
          message: `
Параметры заказа:
Материал: ${materials[calcParams.material].name}
Качество: ${qualities[calcParams.quality].name}
Заполнение: ${calcParams.infill}%
Количество: ${calcParams.quantity} шт.
Объем: ${calcParams.volume} см³
Вес: ${calcParams.weight} г
СТОИМОСТЬ: ${price} руб.

Комментарий: ${orderForm.comments || 'Нет'}
          `
        })
      });
      if (response.ok) {
        alert(`✅ Заказ успешно отправлен!\n\nДетали заказа:\nИмя: ${orderForm.name}\nEmail: ${orderForm.email}\nТелефон: ${orderForm.phone}\n\nСтоимость: ${price} руб.`);
        setOrderForm({ name: '', email: '', phone: '', comments: '' });
      } else {
        throw new Error('Ошибка отправки');
      }
    } catch (error) {
      alert(`⚠️ Заказ оформлен локально!\n\nИмя: ${orderForm.name}\nEmail: ${orderForm.email}\nТелефон: ${orderForm.phone}\n\nСтоимость: ${price} руб.\nМатериал: ${materials[calcParams.material].name}\nКачество: ${qualities[calcParams.quality].name}\nКоличество: ${calcParams.quantity} шт.\n\nПримечание: Для реальной отправки на email необходимо настроить backend.`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-md sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-blue-600">3D Print Lab</h1>
            <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <nav className="hidden md:flex space-x-6">
              <button onClick={() => setActiveTab('home')} className={`${activeTab === 'home' ? 'text-blue-600 font-semibold' : 'text-gray-600'} hover:text-blue-600 transition`}>Главная</button>
              <button onClick={() => setActiveTab('upload')} className={`${activeTab === 'upload' ? 'text-blue-600 font-semibold' : 'text-gray-600'} hover:text-blue-600 transition`}>Загрузить модель</button>
              <button onClick={() => setActiveTab('calculator')} className={`${activeTab === 'calculator' ? 'text-blue-600 font-semibold' : 'text-gray-600'} hover:text-blue-600 transition`}>Калькулятор</button>
              <button onClick={() => setActiveTab('order')} className={`${activeTab === 'order' ? 'text-blue-600 font-semibold' : 'text-gray-600'} hover:text-blue-600 transition`}>Оформить заказ</button>
            </nav>
          </div>
          {menuOpen && (
            <nav className="md:hidden mt-4 flex flex-col space-y-2">
              <button onClick={() => { setActiveTab('home'); setMenuOpen(false); }} className="text-left py-2 text-gray-600 hover:text-blue-600">Главная</button>
              <button onClick={() => { setActiveTab('upload'); setMenuOpen(false); }} className="text-left py-2 text-gray-600 hover:text-blue-600">Загрузить модель</button>
              <button onClick={() => { setActiveTab('calculator'); setMenuOpen(false); }} className="text-left py-2 text-gray-600 hover:text-blue-600">Калькулятор</button>
              <button onClick={() => { setActiveTab('order'); setMenuOpen(false); }} className="text-left py-2 text-gray-600 hover:text-blue-600">Оформить заказ</button>
            </nav>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {activeTab === 'home' && (
          <div>
            <section className="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl p-12 mb-8">
              <h2 className="text-4xl font-bold mb-4">Профессиональная 3D-печать онлайн</h2>
              <p className="text-xl mb-6">Загрузите вашу модель, рассчитайте стоимость и получите готовое изделие за 24-48 часов</p>
              <button onClick={() => setActiveTab('upload')} className="bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition">Начать работу</button>
            </section>
            {/* ... остальной контент home (как в твоем коде) ... */}
            <section className="bg-white rounded-lg shadow-md p-8 mb-8">
              <h3 className="text-2xl font-bold mb-6">Поддерживаемые форматы</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="border border-gray-200 rounded-lg p-4"><Package className="text-blue-600 mb-2" size={30} /><h4 className="font-semibold text-lg">STL</h4><p className="text-gray-600 text-sm">Стандартный формат для 3D-печати</p></div>
                <div className="border border-gray-200 rounded-lg p-4"><Package className="text-blue-600 mb-2" size={30} /><h4 className="font-semibold text-lg">OBJ</h4><p className="text-gray-600 text-sm">Популярный формат 3D-моделей</p></div>
                <div className="border border-gray-200 rounded-lg p-4"><Package className="text-blue-600 mb-2" size={30} /><h4 className="font-semibold text-lg">PLY</h4><p className="text-gray-600 text-sm">Формат для сканированных моделей</p></div>
                <div className="border border-gray-200 rounded-lg p-4"><Package className="text-blue-600 mb-2" size={30} /><h4 className="font-semibold text-lg">GLTF</h4><p className="text-gray-600 text-sm">Современный формат 3D-графики</p></div>
                <div className="border border-gray-200 rounded-lg p-4"><Package className="text-blue-600 mb-2" size={30} /><h4 className="font-semibold text-lg">GLB</h4><p className="text-gray-600 text-sm">Бинарная версия GLTF</p></div>
              </div>
            </section>
            <section className="bg-white rounded-lg shadow-md p-8 mb-8">
              <h3 className="text-2xl font-bold mb-6">Поддерживаемые форматы</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="border border-gray-200 rounded-lg p-4"><Package className="text-blue-600 mb-2" size={30} /><h4 className="font-semibold text-lg">STL</h4><p className="text-gray-600 text-sm">Стандартный формат для 3D-печати</p></div>
                <div className="border border-gray-200 rounded-lg p-4"><Package className="text-blue-600 mb-2" size={30} /><h4 className="font-semibold text-lg">OBJ</h4><p className="text-gray-600 text-sm">Популярный формат 3D-моделей</p></div>
                <div className="border border-gray-200 rounded-lg p-4"><Package className="text-blue-600 mb-2" size={30} /><h4 className="font-semibold text-lg">PLY</h4><p className="text-gray-600 text-sm">Формат для сканированных моделей</p></div>
                <div className="border border-gray-200 rounded-lg p-4"><Package className="text-blue-600 mb-2" size={30} /><h4 className="font-semibold text-lg">GLTF</h4><p className="text-gray-600 text-sm">Современный формат 3D-графики</p></div>
                <div className="border border-gray-200 rounded-lg p-4"><Package className="text-blue-600 mb-2" size={30} /><h4 className="font-semibold text-lg">GLB</h4><p className="text-gray-600 text-sm">Бинарная версия GLTF</p></div>
              </div>
            </section>
            <section className="bg-white rounded-lg shadow-md p-8 mb-8">
              <h3 className="text-2xl font-bold mb-6">Доступные материалы</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(materials).map(([key, mat]) => (
                  <div key={key} className="border border-gray-200 rounded-lg p-4"><Package className="text-blue-600 mb-2" size={30} /><h4 className="font-semibold text-lg">{mat.name}</h4><p className="text-gray-600 text-sm">От {mat.pricePerG} руб/г</p></div>
                ))}
              </div>
            </section>
            <section className="bg-white rounded-lg shadow-md p-8">
              <h3 className="text-2xl font-bold mb-6">Как это работает</h3>
              <div className="space-y-6">
                <div className="flex items-start"><div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold mr-4 flex-shrink-0">1</div><div><h4 className="font-semibold text-lg mb-1">Загрузите 3D модель</h4><p className="text-gray-600">Поддерживаются файлы STL, OBJ, PLY, GLTF, GLB. Вы сразу увидите визуализацию вашей модели.</p></div></div>
                <div className="flex items-start"><div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold mr-4 flex-shrink-0">2</div><div><h4 className="font-semibold text-lg mb-1">Выберите параметры</h4><p className="text-gray-600">Материал, качество печати, заполнение и количество копий.</p></div></div>
                <div className="flex items-start"><div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold mr-4 flex-shrink-0">3</div><div><h4 className="font-semibold text-lg mb-1">Рассчитайте стоимость</h4><p className="text-gray-600">Система автоматически рассчитает точную стоимость вашего заказа.</p></div></div>
                <div className="flex items-start"><div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold mr-4 flex-shrink-0">4</div><div><h4 className="font-semibold text-lg mb-1">Оформите заказ</h4><p className="text-gray-600">Заполните контактные данные и мы свяжемся с вами для подтверждения.</p></div></div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'upload' && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-2xl font-bold mb-4">Загрузка 3D модели</h3>
              {!sceneRef.current && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-blue-800 text-sm">⏳ Инициализация 3D движка...</p>
                </div>
              )}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Upload className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-600 mb-2">Перетащите 3D файл сюда или выберите файл</p>
                <p className="text-sm text-gray-500 mb-4">Поддерживаемые форматы: STL, OBJ, PLY, GLTF, GLB</p>
                <input type="file" accept=".stl,.obj,.ply,.gltf,.glb" onChange={handleFileUpload} className="hidden" id="file-upload" />
                <label htmlFor="file-upload" className="bg-blue-600 text-white px-6 py-2 rounded-lg cursor-pointer hover:bg-blue-700 transition inline-block">Выбрать файл</label>
              </div>
              {modelLoaded && (
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center text-green-700">
                    <CheckCircle className="mr-2" size={20} />
                    <span className="font-semibold">Модель успешно загружена!</span>
                  </div>
                  <div className="mt-3 text-sm text-gray-700">
                    <p>Объем: {calcParams.volume} см³</p>
                    <p>Вес материала: {calcParams.weight} г</p>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-2xl font-bold mb-4">Предпросмотр 3D модели</h3>
              <div
                ref={mountRef}
                className="w-full h-96 bg-gray-100 rounded-lg border border-gray-300 cursor-move select-none"
              />
              {modelLoaded && (
                <p className="text-sm text-gray-600 mt-2 flex items-center">
                  <Eye className="mr-2" size={16} />
                  🖱️ Используйте мышь для вращения и колесико для зума
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'calculator' && (
          <div className="bg-white rounded-lg shadow-md p-6 max-w-3xl mx-auto">
            <h3 className="text-2xl font-bold mb-6">Калькулятор стоимости</h3>
            {!modelLoaded && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <p className="text-yellow-800">Сначала загрузите 3D модель во вкладке "Загрузить модель" для точного расчета</p>
              </div>
            )}
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold mb-2">Материал</label>
                <select value={calcParams.material} onChange={(e) => handleCalcChange('material', e.target.value)} className="w-full border border-gray-300 rounded-lg px-4 py-2">
                  {Object.entries(materials).map(([key, mat]) => (
                    <option key={key} value={key}>{mat.name} - {mat.pricePerG} руб/г</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Качество печати</label>
                <select value={calcParams.quality} onChange={(e) => handleCalcChange('quality', e.target.value)} className="w-full border border-gray-300 rounded-lg px-4 py-2">
                  {Object.entries(qualities).map(([key, qual]) => (
                    <option key={key} value={key}>{qual.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Заполнение: {calcParams.infill}%</label>
                <input type="range" min="10" max="100" step="5" value={calcParams.infill} onChange={(e) => handleCalcChange('infill', parseInt(e.target.value))} className="w-full" />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>10%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Количество копий</label>
                <input type="number" min="1" max="100" value={calcParams.quantity} onChange={(e) => handleCalcChange('quantity', parseInt(e.target.value) || 1)} className="w-full border border-gray-300 rounded-lg px-4 py-2" />
              </div>
              <div className="border-t pt-6">
                <div className="bg-blue-50 rounded-lg p-6">
                  <h4 className="text-lg font-semibold mb-4">Детали расчета</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Объем модели:</span>
                      <span className="font-semibold">{calcParams.volume} см³</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Вес материала:</span>
                      <span className="font-semibold">{calcParams.weight} г</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Материал:</span>
                      <span className="font-semibold">{materials[calcParams.material].name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Качество:</span>
                      <span className="font-semibold">{qualities[calcParams.quality].name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Количество:</span>
                      <span className="font-semibold">{calcParams.quantity} шт.</span>
                    </div>
                  </div>
                  <div className="border-t border-blue-200 mt-4 pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xl font-bold">Итого:</span>
                      <span className="text-3xl font-bold text-blue-600">{price} ₽</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'order' && (
          <div className="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
            <h3 className="text-2xl font-bold mb-6">Оформление заказа</h3>
            {!modelLoaded && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-red-800">Пожалуйста, сначала загрузите 3D модель и рассчитайте стоимость</p>
              </div>
            )}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h4 className="font-semibold mb-2">Детали заказа:</h4>
              <p className="text-sm text-gray-700">Материал: {materials[calcParams.material].name}</p>
              <p className="text-sm text-gray-700">Качество: {qualities[calcParams.quality].name}</p>
              <p className="text-sm text-gray-700">Количество: {calcParams.quantity} шт.</p>
              <p className="text-lg font-bold text-blue-600 mt-2">Стоимость: {price} ₽</p>
            </div>
            <form onSubmit={handleSubmitOrder} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Имя *</label>
                <input type="text" required value={orderForm.name} onChange={(e) => setOrderForm({ ...orderForm, name: e.target.value })} className="w-full border border-gray-300 rounded-lg px-4 py-2" placeholder="Иван Иванов" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Email *</label>
                <input type="email" required value={orderForm.email} onChange={(e) => setOrderForm({ ...orderForm, email: e.target.value })} className="w-full border border-gray-300 rounded-lg px-4 py-2" placeholder="ivan@example.com" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Телефон *</label>
                <input type="tel" required value={orderForm.phone} onChange={(e) => setOrderForm({ ...orderForm, phone: e.target.value })} className="w-full border border-gray-300 rounded-lg px-4 py-2" placeholder="+7 (999) 123-45-67" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Комментарий к заказу</label>
                <textarea value={orderForm.comments} onChange={(e) => setOrderForm({ ...orderForm, comments: e.target.value })} className="w-full border border-gray-300 rounded-lg px-4 py-2 h-32" placeholder="Дополнительные пожелания, адрес доставки..." />
              </div>
              <button type="submit" disabled={!modelLoaded} className={`w-full py-3 rounded-lg font-semibold text-white transition ${modelLoaded ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}`}>Оформить заказ на {price} ₽</button>
            </form>
            <div className="mt-6 text-sm text-gray-600">
              <p>* После оформления заказа мы свяжемся с вами в течение 1 часа для подтверждения деталей.</p>
              <p className="mt-2">* Срок изготовления: 24-48 часов с момента подтверждения.</p>
              <p className="mt-2">* Заказ будет отправлен на email: i43231360@gmail.com</p>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-gray-800 text-white mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h4 className="font-bold text-lg mb-4">3D Print Lab</h4>
              <p className="text-gray-400 text-sm">Профессиональная 3D-печать с точным расчетом стоимости и быстрым изготовлением.</p>
            </div>
            <div>
              <h4 className="font-bold text-lg mb-4">Контакты</h4>
              <p className="text-gray-400 text-sm">Email: info@3dprintlab.ru</p>
              <p className="text-gray-400 text-sm">Телефон: +7 (999) 123-45-67</p>
              <p className="text-gray-400 text-sm">Адрес: г. Москва, ул. Примерная, 123</p>
            </div>
            <div>
              <h4 className="font-bold text-lg mb-4">Режим работы</h4>
              <p className="text-gray-400 text-sm">Пн-Пт: 9:00 - 18:00</p>
              <p className="text-gray-400 text-sm">Сб-Вс: 10:00 - 16:00</p>
            </div>
          </div>
          <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400 text-sm">
            <p>&copy; 2025 3D Print Lab. Все права защищены.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
